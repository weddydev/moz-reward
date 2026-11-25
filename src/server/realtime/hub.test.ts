import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHub, type Hub, type HubDeps, SHUTDOWN_RETRY, type Subscriber } from "./hub";

const U1 = "0190a8f0-0000-7000-8000-0000000000a1";
const U2 = "0190a8f0-0000-7000-8000-0000000000a2";
const SHOP = "0190a8f0-0000-7000-8000-0000000000b1";

/** In-memory stand-in for the shared ioredis subscriber connection. */
class FakeSubscriber extends EventEmitter implements Subscriber {
  channels = new Set<string>();
  subscribe(channel: string): Promise<unknown> {
    this.channels.add(channel);
    return Promise.resolve(1);
  }
  unsubscribe(channel: string): Promise<unknown> {
    this.channels.delete(channel);
    return Promise.resolve(0);
  }
  deliver(channel: string, event: unknown): void {
    this.emit("message", channel, JSON.stringify(event));
  }
  disconnect(): void {
    this.channels.clear();
  }
}

type Reader = { text: () => string; closed: () => boolean; cancel: () => Promise<void> };

function read(stream: ReadableStream<Uint8Array>): Reader {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let done = false;
  void (async () => {
    for (;;) {
      const r = await reader.read();
      if (r.done) {
        done = true;
        return;
      }
      out += decoder.decode(r.value);
    }
  })();
  return { text: () => out, closed: () => done, cancel: () => reader.cancel() };
}

function openS(h: Hub, conn: Parameters<Hub["open"]>[0]): ReadableStream<Uint8Array> {
  const r = h.open(conn);
  if (!r.ok) throw new Error(`not opened: ${r.reason}`);
  return r.stream;
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let hub: Hub | undefined;
afterEach(() => {
  hub?.dispose();
  hub = undefined;
  vi.useRealTimers();
});

function makeHub(over: Partial<HubDeps> = {}): {
  hub: Hub;
  sub: FakeSubscriber;
  valid: Set<string>;
} {
  const sub = new FakeSubscriber();
  const valid = new Set<string>(["s1", "s2", "s3", "s4", "s5", "s6", "s7"]);
  const h = createHub({
    subscriber: () => sub,
    channelPrefix: "t:",
    checkSessions: (ids) => Promise.resolve(new Set(ids.filter((i) => valid.has(i)))),
    now: () => Date.now(),
    rand: Math.random,
    heartbeatMs: 25_000,
    caps: { perUser: 5, perShop: 50, total: 2_000 },
    warn: () => undefined,
    ...over,
  });
  hub = h;
  return { hub: h, sub, valid };
}

const userConn = (sessionId: string, userId = U1) => ({
  userId,
  sessionId,
  deadline: Date.now() + 60 * 60_000,
  channel: { kind: "user" as const, id: userId },
});

describe("[P1-10] realtime hub", () => {
  it("opens with `ready`, subscribes once per channel and fans an event out to every local stream", async () => {
    const { hub, sub } = makeHub();
    const a = read(openS(hub, userConn("s1")));
    const b = read(openS(hub, userConn("s2")));
    await flush();
    expect([...sub.channels]).toEqual([`t:rt:user:${U1}`]);
    sub.deliver(`t:rt:user:${U1}`, { type: "points_credited", data: { shopId: SHOP } });
    await flush();
    for (const r of [a, b]) {
      expect(r.text()).toContain("event: ready\n");
      expect(r.text()).toMatch(/event: points_credited\ndata: \{"shopId":"[^"]+"\}\n\n/);
    }
  });

  it("drops an invalid or oversized event from Redis instead of writing it", async () => {
    const { hub, sub } = makeHub();
    const a = read(openS(hub, userConn("s1")));
    await flush();
    sub.emit("message", `t:rt:user:${U1}`, "{not json");
    sub.deliver(`t:rt:user:${U1}`, {
      type: "points_credited",
      data: { shopId: SHOP, name: "Ann" },
    });
    await flush();
    expect(a.text()).not.toContain("points_credited");
  });

  it("per-user cap: the 6th stream closes the oldest with reason replaced, never refuses the new one", async () => {
    const { hub } = makeHub();
    const readers = ["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => read(openS(hub, userConn(s))));
    await flush();
    expect(readers[0]!.text()).toContain('event: closed\ndata: {"reason":"replaced"}');
    expect(readers[0]!.closed()).toBe(true);
    expect(readers.slice(1).every((r) => !r.closed())).toBe(true);
    expect(hub.stats().streams).toBe(5);
  });

  it("per-shop cap counts staff streams on the shop channel", async () => {
    const { hub } = makeHub({ caps: { perUser: 5, perShop: 2, total: 2_000 } });
    const conn = (s: string, u: string) => ({
      userId: u,
      sessionId: s,
      deadline: Date.now() + 60_000,
      channel: { kind: "shop" as const, id: SHOP },
    });
    const a = read(openS(hub, conn("s1", U1)));
    read(openS(hub, conn("s2", U2)));
    read(openS(hub, conn("s3", U2)));
    await flush();
    expect(a.closed()).toBe(true);
    expect(hub.stats().streams).toBe(2);
  });

  it("heartbeat: a revoked or past-deadline session is closed with an auth event; the rest get a comment", async () => {
    vi.useFakeTimers();
    const { hub, valid } = makeHub();
    const live = read(openS(hub, userConn("s1")));
    const revoked = read(openS(hub, userConn("s2")));
    const expired = read(openS(hub, { ...userConn("s3"), deadline: Date.now() + 10_000 }));
    valid.delete("s2");
    await vi.advanceTimersByTimeAsync(25_000);
    expect(live.text()).toContain(": hb\n\n");
    expect(live.closed()).toBe(false);
    for (const r of [revoked, expired]) {
      expect(r.text()).toContain('event: auth\ndata: {"reason":"signed_out"}');
      expect(r.closed()).toBe(true);
    }
  });

  it("a failing session check keeps streams open (logged), it never closes everyone", async () => {
    vi.useFakeTimers();
    const { hub } = makeHub({ checkSessions: () => Promise.reject(new Error("db down")) });
    const r = read(openS(hub, userConn("s1")));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(r.closed()).toBe(false);
    expect(r.text()).toContain(": hb\n\n");
  });

  it("Redis lost → degraded to every stream; back → ready", async () => {
    const { hub, sub } = makeHub();
    const r = read(openS(hub, userConn("s1")));
    await flush();
    sub.emit("close");
    await flush();
    expect(r.text()).toContain("event: degraded\n");
    sub.emit("ready");
    await flush();
    expect(r.text().match(/event: ready\n/g)).toHaveLength(2);
    expect(hub.stats().degraded).toBe(false);
  });

  it("a stream opened while Redis is down starts degraded", async () => {
    const { hub, sub } = makeHub();
    read(openS(hub, userConn("s1"))); // the process subscriber exists from the first stream on
    sub.emit("close");
    const r = read(openS(hub, userConn("s2")));
    await flush();
    expect(r.text()).toContain("event: degraded\n");
    expect(r.text()).not.toContain("event: ready\n");
  });

  it("cancel removes the stream and unsubscribes the last listener; 1,000 cycles leave nothing behind", async () => {
    const { hub, sub } = makeHub();
    for (let i = 0; i < 1_000; i++) {
      const r = read(openS(hub, userConn("s1", i % 2 === 0 ? U1 : U2)));
      await r.cancel();
    }
    await flush();
    expect(hub.stats()).toMatchObject({ streams: 0, channels: 0 });
    expect(sub.channels.size).toBe(0);
    expect(sub.listenerCount("message")).toBe(1);
  });

  it("shutdown: every stream gets a jittered retry then closes; 100 streams spread over ≥ 5 s; new opens refused", async () => {
    const { hub } = makeHub({ caps: { perUser: 1_000, perShop: 1_000, total: 2_000 } });
    const readers = Array.from({ length: 100 }, (_, i) =>
      read(openS(hub, userConn("s1", `0190a8f0-0000-7000-8000-${String(i).padStart(12, "0")}`))),
    );
    await flush();
    hub.shutdown();
    await flush();
    const retries = readers.map((r) => {
      expect(r.closed()).toBe(true);
      expect(r.text()).toMatch(/retry: \d+\nevent: closed\ndata: \{"reason":"restart"\}\n\n$/);
      return Number(/retry: (\d+)/.exec(r.text())![1]);
    });
    expect(Math.min(...retries)).toBeGreaterThanOrEqual(SHUTDOWN_RETRY.minMs);
    expect(Math.max(...retries)).toBeLessThan(SHUTDOWN_RETRY.minMs + SHUTDOWN_RETRY.spreadMs);
    expect(Math.max(...retries) - Math.min(...retries)).toBeGreaterThanOrEqual(5_000);
    expect(hub.open(userConn("s2"))).toEqual({ ok: false, reason: "stopping" });
  });

  it("a slow reader whose queue passes the limit is dropped (memory stays bounded)", async () => {
    const { hub, sub } = makeHub({ maxQueuedBytes: 4_096 });
    const stream = openS(hub, userConn("s1")); // never read
    await flush();
    for (let i = 0; i < 200; i++) {
      sub.deliver(`t:rt:user:${U1}`, { type: "points_credited", data: { shopId: SHOP } });
    }
    await flush();
    expect(hub.stats().streams).toBe(0);
    await expect(stream.cancel()).rejects.toThrow(/too slow/);
  });

  it("process-wide cap: past the total, a new stream is refused as busy (route answers 503)", async () => {
    const { hub } = makeHub({ caps: { perUser: 5, perShop: 50, total: 2 } });
    read(openS(hub, userConn("s1", U1)));
    read(openS(hub, userConn("s2", U2)));
    await flush();
    expect(hub.open(userConn("s3", U1))).toEqual({ ok: false, reason: "busy" });
  });

  it("session check failing past the 5-minute budget closes streams with recheck_failed", async () => {
    vi.useFakeTimers();
    const { hub } = makeHub({ checkSessions: () => Promise.reject(new Error("db down")) });
    const r = read(openS(hub, userConn("s1")));
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 50_000); // 11 ticks, < 5 min since the timer started
    expect(r.closed()).toBe(false);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(r.text()).toContain('event: closed\ndata: {"reason":"recheck_failed"}');
    expect(r.closed()).toBe(true);
  });

  it("max lifetime: a stream is closed for refresh with a short jittered retry, so authz runs in full again", async () => {
    vi.useFakeTimers();
    const { hub } = makeHub({ maxLifetimeMs: 60_000 });
    const r = read(openS(hub, userConn("s1")));
    await vi.advanceTimersByTimeAsync(50_000);
    expect(r.closed()).toBe(false);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(r.text()).toMatch(/retry: \d+\nevent: closed\ndata: \{"reason":"refresh"\}/);
    expect(r.closed()).toBe(true);
  });

  it("an aborted request removes its stream (connection dropped without a body cancel)", async () => {
    const { hub, sub } = makeHub();
    const ac = new AbortController();
    const r = read(openS(hub, { ...userConn("s1"), signal: ac.signal }));
    await flush();
    ac.abort();
    await flush();
    expect(r.closed()).toBe(true);
    expect(hub.stats()).toMatchObject({ streams: 0, channels: 0 });
    expect(sub.channels.size).toBe(0);
  });
});
