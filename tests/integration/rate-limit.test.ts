import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { isAppError } from "@/server/errors";
import { createRedis } from "@/server/jobs/connection";
import {
  closeLimiter,
  createLimiter,
  ipKey,
  limit,
  limitOrThrow,
  tooManyRequests,
  userKey,
} from "@/server/security/rate-limit";

const redis = createRedis("limiter");
const limiter = createLimiter(redis);
const key = (): string => `test:${newId()}`;
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);

afterAll(async () => {
  await redis.quit();
  await closeLimiter();
});

describe("[P0-05] sliding-window rate limiter (real Redis)", () => {
  it("allows up to max, then blocks; remaining counts down", async () => {
    const k = key();
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await limiter({ key: k, max: 3, windowSec: 60, now: T0 + i }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
  });

  it("recovers after the window and reports when", async () => {
    const k = key();
    for (let i = 0; i < 2; i++) await limiter({ key: k, max: 2, windowSec: 10, now: T0 });
    const blocked = await limiter({ key: k, max: 2, windowSec: 10, now: T0 + 9_999 });
    expect(blocked.ok).toBe(false);
    expect(blocked.resetAt.getTime()).toBe(T0 + 10_000);
    expect((await limiter({ key: k, max: 2, windowSec: 10, now: T0 + 10_001 })).ok).toBe(true);
  });

  it("slides: only hits inside the last window count", async () => {
    const k = key();
    for (let i = 0; i < 3; i++) await limiter({ key: k, max: 5, windowSec: 10, now: T0 });
    for (let i = 0; i < 2; i++) await limiter({ key: k, max: 5, windowSec: 10, now: T0 + 6_000 });
    expect((await limiter({ key: k, max: 5, windowSec: 10, now: T0 + 9_000 })).ok).toBe(false);
    // The 3 hits at T0 have left the window; the 2 at T0+6s still count.
    const later = await limiter({ key: k, max: 5, windowSec: 10, now: T0 + 10_500 });
    expect(later).toMatchObject({ ok: true, remaining: 2 });
  });

  it("blocked attempts are not recorded, so hammering does not extend the lockout", async () => {
    const k = key();
    await limiter({ key: k, max: 1, windowSec: 10, now: T0 });
    for (let i = 1; i <= 50; i++)
      await limiter({ key: k, max: 1, windowSec: 10, now: T0 + i * 100 });
    expect((await limiter({ key: k, max: 1, windowSec: 10, now: T0 + 10_001 })).ok).toBe(true);
  });

  it("is atomic under concurrency: exactly max of 25 parallel calls pass", async () => {
    const k = key();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => limiter({ key: k, max: 5, windowSec: 60, now: T0 })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("keeps keys apart (per IP vs per user, different scopes)", async () => {
    const id = newId();
    expect(ipKey("magic-link", "203.0.113.7")).not.toBe(userKey("magic-link", "203.0.113.7"));
    await limiter({ key: userKey(`t-${id}`, "u-1"), max: 1, windowSec: 60, now: T0 });
    expect(
      (await limiter({ key: userKey(`t-${id}`, "u-1"), max: 1, windowSec: 60, now: T0 })).ok,
    ).toBe(false);
    expect(
      (await limiter({ key: userKey(`t-${id}`, "u-2"), max: 1, windowSec: 60, now: T0 })).ok,
    ).toBe(true);
    expect(
      (await limiter({ key: ipKey(`t-${id}`, "203.0.113.7"), max: 1, windowSec: 60, now: T0 })).ok,
    ).toBe(true);
  });

  it("expires its Redis key after the window (no unbounded growth)", async () => {
    const k = key();
    await limiter({ key: k, max: 5, windowSec: 30, now: Date.now() });
    const keys = await redis.keys(`*rl:${k}`);
    expect(keys).toHaveLength(1);
    const ttl = await redis.pttl(keys[0] ?? "");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30_000);
  });

  it("limitOrThrow raises RATE_LIMITED (429) with a user-safe message; tooManyRequests sets Retry-After", async () => {
    const k = key();
    await limitOrThrow({ key: k, max: 1, windowSec: 60 });
    const err = await limitOrThrow({ key: k, max: 1, windowSec: 60 }).catch((e: unknown) => e);
    expect(isAppError(err) && err.code === "RATE_LIMITED" && err.status === 429).toBe(true);
    expect((err as Error).message).toMatch(/too many/i);

    const res = tooManyRequests({
      ok: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 42_000),
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThanOrEqual(41);
    expect(Number(res.headers.get("retry-after"))).toBeLessThanOrEqual(42);
  });

  it("the default limiter uses the shared connection", async () => {
    expect((await limit({ key: key(), max: 1, windowSec: 5 })).ok).toBe(true);
  });

  it("Redis unreachable: fails open by default (logged), fails closed when asked", async () => {
    const down = new Redis("redis://127.0.0.1:1", {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    const broken = createLimiter(down);
    expect(await broken({ key: key(), max: 1, windowSec: 5 })).toMatchObject({
      ok: true,
      degraded: true,
    });
    expect(await broken({ key: key(), max: 1, windowSec: 5, onError: "closed" })).toMatchObject({
      ok: false,
      degraded: true,
    });
    down.disconnect();
  });
});
