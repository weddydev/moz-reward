import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "./shutdown";

afterEach(() => {
  vi.useRealTimers();
});

function setup(close: () => Promise<void>, timeoutMs = 1_000) {
  const exit = vi.fn<(code: number) => void>();
  const events: string[] = [];
  const shutdown = createShutdown({ close, exit, log: (e) => events.push(e), timeoutMs });
  return { shutdown, exit, events };
}

describe("[P0-04] worker graceful shutdown", () => {
  it("waits for close (in-flight jobs) and then exits 0", async () => {
    let release = (): void => {};
    const close = vi.fn(() => new Promise<void>((r) => (release = r)));
    const { shutdown, exit, events } = setup(close);
    const done = shutdown("SIGTERM");
    await Promise.resolve();
    expect(exit).not.toHaveBeenCalled();
    release();
    await done;
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(events).toEqual(["worker.stopping", "worker.stopped"]);
  });

  it("ignores a second signal while stopping (close runs once)", async () => {
    const close = vi.fn(() => Promise.resolve());
    const { shutdown, exit } = setup(close);
    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("exits 1 when closing takes longer than the timeout", async () => {
    vi.useFakeTimers();
    const { shutdown, exit, events } = setup(() => new Promise<void>(() => {}), 45_000);
    void shutdown("SIGTERM");
    vi.advanceTimersByTime(45_000);
    expect(exit).toHaveBeenCalledWith(1);
    expect(events).toContain("worker.shutdown_timeout");
  });

  it("exits 1 when closing fails", async () => {
    const { shutdown, exit, events } = setup(() => Promise.reject(new Error("redis gone")));
    await shutdown("SIGTERM");
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(events).toContain("worker.shutdown_failed");
  });
});
