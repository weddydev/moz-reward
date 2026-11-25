import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeClient, type RealtimeClientDeps } from "./client";

/** A controllable SSE response body. */
function sseBody(): { response: Response; push: (s: string) => void; end: () => void } {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const enc = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    push: (s) => {
      ctrl.enqueue(enc.encode(s));
    },
    end: () => {
      ctrl.close();
    },
  };
}

const tick = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};

function setup(responses: Array<Response | Error>) {
  const calls: string[] = [];
  const fetchMock = vi.fn((url: string | URL | Request) => {
    calls.push(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    const next = responses.shift();
    if (!next) return new Promise<Response>(() => undefined); // hangs: no more connects in this test
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const deps = {
    url: "/api/sse/me",
    onEvent: vi.fn(),
    refetch: vi.fn(),
    onSignedOut: vi.fn(),
    fetch: fetchMock as unknown as typeof fetch,
    rand: () => 0.5,
  } satisfies RealtimeClientDeps;
  const client = createRealtimeClient(deps);
  return { client, deps, calls };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("[P1-10] realtime client", () => {
  it("delivers known events, ignores unknown ones and doesn't refetch on the first open", async () => {
    const s = sseBody();
    const { client, deps } = setup([s.response]);
    client.start();
    await tick();
    s.push(
      'event: ready\ndata: {}\n\nevent: points_credited\ndata: {"shopId":"a"}\n\nevent: evil\ndata: {}\n\n',
    );
    await tick();
    expect(client.state()).toBe("open");
    expect(deps.onEvent).toHaveBeenCalledTimes(1);
    expect(deps.onEvent).toHaveBeenCalledWith("points_credited", { shopId: "a" });
    expect(deps.refetch).not.toHaveBeenCalled();
    client.stop();
  });

  it("reconnects with backoff after the stream drops, and refetches once it is open again", async () => {
    const first = sseBody();
    const second = sseBody();
    const { client, deps, calls } = setup([new Error("offline"), first.response, second.response]);
    client.start();
    await tick();
    expect(client.state()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1_000); // attempt 0: ≤ 1 s
    first.push("event: ready\ndata: {}\n\n");
    await tick();
    expect(deps.refetch).not.toHaveBeenCalled();
    first.end();
    await tick();
    await vi.advanceTimersByTimeAsync(2_000); // attempt 1: ≤ 2 s
    second.push("event: ready\ndata: {}\n\n");
    await tick();
    expect(calls).toHaveLength(3);
    expect(deps.refetch).toHaveBeenCalledTimes(1);
    client.stop();
  });

  it("honours the server's retry: on a shutdown close", async () => {
    const s = sseBody();
    const { client, calls } = setup([s.response]);
    client.start();
    await tick();
    s.push('event: ready\ndata: {}\n\nretry: 7000\nevent: closed\ndata: {"reason":"restart"}\n\n');
    s.end();
    await tick();
    await vi.advanceTimersByTimeAsync(6_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(2);
    client.stop();
  });

  it("401 → signed out, no retry; an auth event closes the same way", async () => {
    const a = setup([new Response(null, { status: 401 })]);
    a.client.start();
    await tick();
    expect(a.deps.onSignedOut).toHaveBeenCalledTimes(1);
    expect(a.client.state()).toBe("stopped");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(a.calls).toHaveLength(1);

    const s = sseBody();
    const b = setup([s.response]);
    b.client.start();
    await tick();
    s.push('event: ready\ndata: {}\n\nevent: auth\ndata: {"reason":"signed_out"}\n\n');
    s.end();
    await tick();
    expect(b.deps.onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("403 stops for good", async () => {
    const { client, calls } = setup([new Response(null, { status: 403 })]);
    client.start();
    await tick();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(client.state()).toBe("stopped");
    expect(calls).toHaveLength(1);
  });

  it("429/503: waits Retry-After (plus jitter) and polls every 15 s meanwhile", async () => {
    const { client, deps, calls } = setup([
      new Response(null, { status: 503, headers: { "Retry-After": "40" } }),
    ]);
    client.start();
    await tick();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(deps.refetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(deps.refetch).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(40_000 * 1.25 - 30_000 + 10);
    expect(calls).toHaveLength(2);
    client.stop();
  });

  it("degraded → polls every 15 s; ready again → stops polling and refetches", async () => {
    const s = sseBody();
    const { client, deps } = setup([s.response]);
    client.start();
    await tick();
    s.push("event: ready\ndata: {}\n\nevent: degraded\ndata: {}\n\n");
    await tick();
    expect(client.state()).toBe("degraded");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(deps.refetch).toHaveBeenCalledTimes(2);
    s.push("event: ready\ndata: {}\n\n");
    await tick();
    expect(deps.refetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(deps.refetch).toHaveBeenCalledTimes(3);
    client.stop();
  });

  it("a silent stream (no heartbeat for 2.5 intervals) is replaced", async () => {
    const s = sseBody();
    const { client, calls } = setup([s.response]);
    client.start();
    await tick();
    s.push("event: ready\ndata: {}\n\n");
    await tick();
    await vi.advanceTimersByTimeAsync(62_500 + 1_000);
    await tick();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    client.stop();
  });
});
