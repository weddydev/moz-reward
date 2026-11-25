import "server-only";
import { log } from "@/server/log";
import { parseRealtimeEvent, type RealtimeTarget } from "./events";

/**
 * The realtime stream hub (P1-10, ARCHITECTURE §7). One per web process: it owns every open SSE stream of the
 * process and **one** shared Redis subscriber connection (never one per client), subscribing to a channel when
 * its first local stream opens and unsubscribing when its last one closes.
 *
 * - Caps: per user and per shop channel; over a cap the **oldest** stream is closed (`closed: replaced`), the
 *   new one is always accepted. Caps are per process (DECISIONS 25 Nov).
 * - One process-wide heartbeat timer: each tick re-checks every stream's session in one batched query
 *   (revoked or expired → `auth: signed_out` and closed) and its local deadline (role session limits), then
 *   writes a comment so proxies and the client see a live stream.
 * - Redis lost → `degraded` to every stream (the client polls); back → `ready` (the client refetches).
 * - Shutdown → every stream gets a jittered `retry:` and `closed: restart`, so clients don't return together.
 * - A reader that falls behind past `maxQueuedBytes` is dropped, so a stalled phone can't grow memory.
 *
 * All I/O is injected (subscriber, session check, clock, randomness) so it is unit-testable; `process-hub.ts`
 * wires the real ones.
 */

/** The part of an ioredis subscriber connection the hub uses. */
export type Subscriber = {
  subscribe: (channel: string) => Promise<unknown>;
  unsubscribe: (channel: string) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ioredis/EventEmitter listener signature
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  removeAllListeners: (event?: string) => unknown;
  disconnect: () => void;
};

export type HubDeps = {
  subscriber: () => Subscriber;
  /** Prepended to channel names (REDIS_KEY_PREFIX), so test runs and environments never cross. */
  channelPrefix: string;
  /** The ids among `sessionIds` that are still valid sessions (exist, not expired). */
  checkSessions: (sessionIds: string[]) => Promise<Set<string>>;
  now: () => number;
  rand: () => number;
  heartbeatMs: number;
  caps: { perUser: number; perShop: number; total: number };
  /** Longest a stream lives before it is closed with `closed: refresh` so the full authz runs again (± jitter). */
  maxLifetimeMs?: number;
  /** A failing session check keeps streams only while the last good one is younger than this; then they close. */
  recheckBudgetMs?: number;
  maxQueuedBytes?: number;
  warn?: (fields: Record<string, unknown>, message: string) => void;
  /** Called after each heartbeat with the number of open streams (System page). */
  report?: (streams: number) => void;
};

export type StreamConn = {
  userId: string;
  sessionId: string;
  /** Epoch ms after which the stream closes (role session limit); the session check covers revocation. */
  deadline: number;
  channel: RealtimeTarget;
  /** The request's signal: a dropped connection is cleaned up even if the body is never cancelled. */
  signal?: AbortSignal;
};

export type Hub = {
  /** A new SSE stream, or why none was opened (shutting down, or the process-wide cap is reached). */
  open: (
    conn: StreamConn,
  ) =>
    { ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; reason: "stopping" | "busy" };
  shutdown: () => void;
  stats: () => { streams: number; channels: number; degraded: boolean; stopping: boolean };
  /** Open streams of one user (tests, debugging). */
  streamsFor: (userId: string) => number;
  dispose: () => void;
};

/** Shutdown `retry:` delays are uniform in [minMs, minMs + spreadMs): 100 streams spread over ≥ 5 s. */
export const SHUTDOWN_RETRY = { minMs: 1_000, spreadMs: 10_000 } as const;
export const DEFAULT_MAX_QUEUED_BYTES = 64 * 1024;
/** ARCHITECTURE §7: authorisation is fully re-run at least this often (a stream lives ~60 min ± 5 min). */
export const MAX_LIFETIME = { baseMs: 60 * 60_000, jitterMs: 5 * 60_000 } as const;
export const RECHECK_BUDGET_MS = 5 * 60_000;
/** `retry:` sent with a routine refresh close: reconnect soon, spread over 1–6 s. */
const REFRESH_RETRY = { minMs: 1_000, spreadMs: 5_000 } as const;

type Stream = StreamConn & {
  seq: number;
  /** Epoch ms at which the stream is closed for a routine re-authorisation (max lifetime). */
  refreshAt: number;
  channelName: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  closed: boolean;
};

const encoder = new TextEncoder();
const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export function createHub(deps: HubDeps): Hub {
  const maxQueued = deps.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
  const warn =
    deps.warn ??
    ((fields, message) => {
      log().warn(fields, message);
    });
  const streams = new Map<number, Stream>(); // insertion order = oldest first
  const channels = new Map<string, Set<Stream>>();
  let sub: Subscriber | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let degraded = false;
  let stopping = false;
  let seq = 0;
  let lastGoodCheck = deps.now();
  const maxLifetime = deps.maxLifetimeMs ?? MAX_LIFETIME.baseMs;
  const recheckBudget = deps.recheckBudgetMs ?? RECHECK_BUDGET_MS;

  const channelName = (t: RealtimeTarget): string => `${deps.channelPrefix}rt:${t.kind}:${t.id}`;

  function subscriber(): Subscriber {
    if (sub) return sub;
    const s = deps.subscriber();
    s.on("message", (channel: string, message: string) => {
      onMessage(channel, message);
    });
    const lost = (): void => {
      if (degraded) return;
      degraded = true;
      for (const st of [...streams.values()]) send(st, frame("degraded", {}));
    };
    s.on("close", lost);
    s.on("end", lost);
    s.on("ready", () => {
      if (!degraded) return;
      degraded = false;
      for (const st of [...streams.values()]) send(st, frame("ready", {}));
    });
    s.on("error", (err: unknown) => {
      warn({ err }, "realtime subscriber error");
    });
    sub = s;
    return s;
  }

  function onMessage(channel: string, message: string): void {
    const set = channels.get(channel);
    if (!set) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      parsed = null;
    }
    const event = parseRealtimeEvent(parsed);
    if (!event) {
      warn(
        { channel: channel.replace(/[0-9a-f-]{36}$/, "<id>") },
        "realtime: invalid event dropped",
      );
      return;
    }
    const text = frame(event.type, event.data);
    for (const st of [...set]) send(st, text);
  }

  /** Writes `text`; false when the stream is (now) gone: cancelled, or dropped for reading too slowly. */
  function send(st: Stream, text: string): boolean {
    if (st.closed) return false;
    try {
      st.controller.enqueue(encoder.encode(text));
    } catch {
      remove(st);
      return false;
    }
    const room = st.controller.desiredSize;
    if (room !== null && room < 0) {
      remove(st);
      st.controller.error(new Error("realtime reader too slow"));
      return false;
    }
    return true;
  }

  function remove(st: Stream): void {
    if (st.closed) return;
    st.closed = true;
    streams.delete(st.seq);
    const set = channels.get(st.channelName);
    set?.delete(st);
    if (set && set.size === 0) {
      channels.delete(st.channelName);
      sub?.unsubscribe(st.channelName).catch((err: unknown) => {
        warn({ err }, "realtime unsubscribe failed");
      });
    }
    if (streams.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function close(st: Stream, last: string): void {
    if (!send(st, last)) return; // already gone, or dropped while sending
    remove(st);
    try {
      st.controller.close();
    } catch {
      // already cancelled by the reader
    }
  }

  function enforceCap(list: Stream[], cap: number): void {
    for (const old of list.slice(0, Math.max(0, list.length - cap))) {
      close(old, frame("closed", { reason: "replaced" }));
    }
  }

  async function tick(): Promise<void> {
    const open = [...streams.values()];
    if (open.length === 0) return;
    let valid: Set<string> | null = null;
    try {
      valid = await deps.checkSessions([...new Set(open.map((s) => s.sessionId))]);
      lastGoodCheck = deps.now();
    } catch (err) {
      // A database blip keeps streams open (closing them all would only send every client back into the same
      // outage), but only within the re-check budget: past it, nothing unverified stays open.
      warn({ err }, "realtime session check failed");
    }
    const now = deps.now();
    const overBudget = valid === null && now - lastGoodCheck >= recheckBudget;
    for (const st of open) {
      if (st.closed) continue;
      if ((valid && !valid.has(st.sessionId)) || now >= st.deadline) {
        close(st, frame("auth", { reason: "signed_out" }));
      } else if (overBudget) {
        close(st, frame("closed", { reason: "recheck_failed" }));
      } else if (now >= st.refreshAt) {
        const retry = REFRESH_RETRY.minMs + Math.floor(deps.rand() * REFRESH_RETRY.spreadMs);
        close(st, `retry: ${String(retry)}\n${frame("closed", { reason: "refresh" })}`);
      } else {
        send(st, ": hb\n\n");
      }
    }
    deps.report?.(streams.size);
  }

  function ensureTimer(): void {
    if (timer) return;
    lastGoodCheck = deps.now(); // the budget counts from when there is something to check
    timer = setInterval(() => void tick(), deps.heartbeatMs);
    timer.unref();
  }

  return {
    open(conn) {
      if (stopping) return { ok: false, reason: "stopping" };
      if (streams.size >= deps.caps.total) return { ok: false, reason: "busy" };
      const s = subscriber();
      const name = channelName(conn.channel);
      let st: Stream | undefined;
      const stream = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            const jitter = Math.floor((deps.rand() * 2 - 1) * MAX_LIFETIME.jitterMs);
            const refreshAt =
              deps.now() + maxLifetime + (maxLifetime === MAX_LIFETIME.baseMs ? jitter : 0);
            st = { ...conn, seq: ++seq, refreshAt, channelName: name, controller, closed: false };
            streams.set(st.seq, st);
            let set = channels.get(name);
            if (!set) {
              set = new Set();
              channels.set(name, set);
              s.subscribe(name).catch((err: unknown) => {
                warn({ err }, "realtime subscribe failed");
              });
            }
            set.add(st);
            const self = st;
            conn.signal?.addEventListener(
              "abort",
              () => {
                if (self.closed) return;
                remove(self);
                try {
                  controller.close();
                } catch {
                  // already closed
                }
              },
              { once: true },
            );
            send(st, frame(degraded ? "degraded" : "ready", {}));
            ensureTimer();
            const mine = [...streams.values()].filter((x) => x.userId === conn.userId);
            enforceCap(mine, deps.caps.perUser);
            if (conn.channel.kind === "shop") enforceCap([...set], deps.caps.perShop);
          },
          cancel() {
            if (st) remove(st);
          },
        },
        { highWaterMark: maxQueued, size: (chunk) => chunk.byteLength },
      );
      return { ok: true, stream };
    },

    shutdown() {
      stopping = true;
      for (const st of [...streams.values()]) {
        const retry = SHUTDOWN_RETRY.minMs + Math.floor(deps.rand() * SHUTDOWN_RETRY.spreadMs);
        close(st, `retry: ${String(retry)}\n${frame("closed", { reason: "restart" })}`);
      }
    },

    stats: () => ({ streams: streams.size, channels: channels.size, degraded, stopping }),
    streamsFor: (userId) => [...streams.values()].filter((st) => st.userId === userId).length,

    dispose() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const st of [...streams.values()]) {
        remove(st);
        try {
          st.controller.close();
        } catch {
          // already closed
        }
      }
      if (sub) {
        sub.removeAllListeners();
        sub.disconnect();
        sub = null;
      }
    },
  };
}
