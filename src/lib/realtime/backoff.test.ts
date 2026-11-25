import { describe, expect, it } from "vitest";
import { BACKOFF, nextDelay, retryAfterDelay } from "./backoff";

describe("[P1-10] reconnect backoff", () => {
  it("full jitter: each delay is in [0, min(cap, base·2^attempt)) and never below the floor", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = Math.min(BACKOFF.capMs, BACKOFF.baseMs * 2 ** attempt);
      expect(nextDelay(attempt, () => 0)).toBe(BACKOFF.floorMs);
      expect(nextDelay(attempt, () => 0.999_999)).toBeLessThanOrEqual(ceiling);
      expect(nextDelay(attempt, () => 0.999_999)).toBeGreaterThan(ceiling * 0.99);
    }
  });

  it("caps at 30 s however many attempts failed", () => {
    expect(nextDelay(50, () => 0.999_999)).toBeLessThanOrEqual(30_000);
    expect(nextDelay(Number.MAX_SAFE_INTEGER, () => 0.5)).toBeLessThanOrEqual(30_000);
  });

  it("spreads 1,000 clients: no more than 5% land in any 1-second slot at attempt 5", () => {
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const slots = new Map<number, number>();
    for (let i = 0; i < 1_000; i++) {
      const s = Math.floor(nextDelay(5, rand) / 1_000);
      slots.set(s, (slots.get(s) ?? 0) + 1);
    }
    expect(Math.max(...slots.values())).toBeLessThanOrEqual(50 + 20);
  });

  it("Retry-After (seconds) is honoured plus up to 50% jitter, and bounded", () => {
    expect(retryAfterDelay("10", () => 0)).toBe(10_000);
    expect(retryAfterDelay("10", () => 0.999_999)).toBeLessThan(15_000);
    // Missing or junk header: the normal backoff decides (null).
    expect(retryAfterDelay(null, () => 0)).toBeNull();
    expect(retryAfterDelay("soon", () => 0)).toBeNull();
    // A hostile or broken value never parks the client for hours.
    expect(retryAfterDelay("86400", () => 0)).toBe(BACKOFF.maxRetryAfterMs);
  });
});
