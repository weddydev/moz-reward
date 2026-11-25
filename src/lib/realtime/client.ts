import { BACKOFF, nextDelay, retryAfterDelay } from "./backoff";
import { DEGRADED_POLL_MS, HEARTBEAT_MS, isRealtimeEvent, type RealtimeEventType } from "./events";
import { createSseParser } from "./sse-parser";

/**
 * The realtime client (P1-10, ARCHITECTURE §7), framework-free so it is unit-testable; `useRealtime` wraps it.
 *  - fetch-based SSE (sees 401/403/429/503, which EventSource hides), same-origin credentials, no cache;
 *  - reconnects with full-jitter backoff, or after the server's `retry:` (shutdown/refresh) once;
 *  - SSE is a hint, the database is the truth: `refetch` runs after every reconnect, on `ready` after
 *    `degraded`, and every 15 s while the stream is degraded or refused (429/503), so the page never goes
 *    stale while realtime is down (security design check M8);
 *  - 401 or an `auth` event → `onSignedOut` (the page sends the user to sign in), no retry; 403 → stop;
 *  - no bytes for 2.5 heartbeats → the stream is treated as dead and replaced;
 *  - `closed: replaced` (over the per-user cap, a newer tab took the slot) → `replaced`: no reconnect (two tabs
 *    would otherwise keep pushing each other out), polls every 15 s until `start()` (the tab shown again).
 */
export type RealtimeState =
  "idle" | "connecting" | "open" | "degraded" | "waiting" | "replaced" | "stopped";

export type RealtimeClientDeps = {
  url: string;
  onEvent: (type: RealtimeEventType, data: unknown) => void;
  refetch: () => void;
  onSignedOut: () => void;
  onState?: (state: RealtimeState) => void;
  fetch?: typeof fetch;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  now?: () => number;
  rand?: () => number;
};

export type RealtimeClient = { start: () => void; stop: () => void; state: () => RealtimeState };

const DEAD_AFTER_MS = Math.round(HEARTBEAT_MS * 2.5);

export function createRealtimeClient(deps: RealtimeClientDeps): RealtimeClient {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const setT = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT =
    deps.clearTimeout ??
    ((h: unknown) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    });
  const now = deps.now ?? Date.now;
  const rand = deps.rand ?? Math.random;

  let state: RealtimeState = "idle";
  let attempt = 0;
  let everOpened = false;
  let openedAt = 0;
  let serverRetry: number | null = null;
  let controller: AbortController | null = null;
  let reconnectTimer: unknown = null;
  let pollTimer: unknown = null;
  let deadTimer: unknown = null;
  let reader: ReadableStreamDefaultReader<string> | null = null;
  let generation = 0;

  /** Ends the current stream from our side: abort the request and cancel its body reader. */
  const dropStream = (): void => {
    controller?.abort();
    reader?.cancel().catch(() => undefined);
  };

  const setState = (s: RealtimeState): void => {
    state = s;
    deps.onState?.(s);
  };

  function startPolling(): void {
    if (pollTimer !== null) return;
    const tick = (): void => {
      pollTimer = setT(() => {
        deps.refetch();
        tick();
      }, DEGRADED_POLL_MS);
    };
    tick();
  }
  function stopPolling(): void {
    if (pollTimer !== null) clearT(pollTimer);
    pollTimer = null;
  }
  function armDeadTimer(gen: number): void {
    if (deadTimer !== null) clearT(deadTimer);
    deadTimer = setT(() => {
      if (gen !== generation) return;
      dropStream();
    }, DEAD_AFTER_MS);
  }

  function scheduleReconnect(delay: number): void {
    if (state === "stopped") return;
    setState("waiting");
    if (reconnectTimer !== null) clearT(reconnectTimer);
    reconnectTimer = setT(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  }

  function afterStreamEnded(): void {
    if (state === "stopped") return;
    if (openedAt > 0 && now() - openedAt >= BACKOFF.healthyAfterMs) attempt = 0;
    const delay = serverRetry ?? nextDelay(attempt, rand);
    serverRetry = null;
    attempt++;
    startPolling();
    scheduleReconnect(delay);
  }

  function signedOut(): void {
    stop();
    deps.onSignedOut();
  }

  async function connect(): Promise<void> {
    if (state === "stopped") return;
    const gen = ++generation;
    controller = new AbortController();
    setState("connecting");
    openedAt = 0;
    let res: Response;
    try {
      res = await doFetch(deps.url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
    } catch {
      if (gen === generation) afterStreamEnded();
      return;
    }
    if (gen !== generation) return;
    if (res.status === 401) {
      signedOut();
      return;
    }
    if (res.status === 403) {
      stop();
      return;
    }
    if (res.status === 429 || res.status === 503) {
      serverRetry = retryAfterDelay(res.headers.get("Retry-After"), rand);
      afterStreamEnded();
      return;
    }
    if (!res.ok || !res.body) {
      afterStreamEnded();
      return;
    }

    // Set from the parser callback (an `auth` event): the stream then ends as "signed out", not as a drop.
    const ended = { byAuth: false, replaced: false };
    const parser = createSseParser({
      onRetry: (ms) => {
        serverRetry = Math.min(ms, BACKOFF.maxRetryAfterMs);
      },
      onMessage: (m) => {
        if (m.event === "ready") {
          const wasDegraded = state === "degraded";
          setState("open");
          stopPolling();
          if (openedAt === 0) openedAt = now();
          if (everOpened || wasDegraded) deps.refetch();
          everOpened = true;
          return;
        }
        if (m.event === "degraded") {
          setState("degraded");
          startPolling();
          return;
        }
        if (m.event === "auth") {
          ended.byAuth = true;
          return;
        }
        if (m.event === "closed") {
          // `retry:` (if any) arrived just before; the stream ends next.
          try {
            ended.replaced = (JSON.parse(m.data) as { reason?: unknown }).reason === "replaced";
          } catch {
            // a closed frame without a readable reason ends like any other drop
          }
          return;
        }
        if (isRealtimeEvent(m.event)) {
          let data: unknown = null;
          try {
            data = JSON.parse(m.data);
          } catch {
            return;
          }
          deps.onEvent(m.event, data);
        }
      },
    });

    const current = res.body.pipeThrough(new TextDecoderStream()).getReader();
    reader = current;
    armDeadTimer(gen);
    try {
      for (;;) {
        const { done, value } = await current.read();
        if (done || gen !== generation) break;
        armDeadTimer(gen);
        parser.push(value);
      }
    } catch {
      // aborted (dead stream, stop) or the network dropped: handled below
    }
    if (reader === current) reader = null;
    if (gen !== generation) return;
    if (deadTimer !== null) clearT(deadTimer);
    deadTimer = null;
    if (ended.byAuth) {
      signedOut();
      return;
    }
    if (ended.replaced) {
      stop();
      setState("replaced");
      startPolling();
      return;
    }
    afterStreamEnded();
  }

  function stop(): void {
    setState("stopped");
    generation++;
    dropStream();
    controller = null;
    reader = null;
    stopPolling();
    if (reconnectTimer !== null) clearT(reconnectTimer);
    if (deadTimer !== null) clearT(deadTimer);
    reconnectTimer = null;
    deadTimer = null;
  }

  return {
    start() {
      if (state !== "idle" && state !== "stopped" && state !== "replaced") return;
      stopPolling();
      state = "idle";
      attempt = 0;
      void connect();
    },
    stop,
    state: () => state,
  };
}
