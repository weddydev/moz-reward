import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import {
  AttemptGuardUnavailable,
  clearAttempts,
  releaseAttempt,
  reserveAttempt,
  type AttemptDecision,
} from "@/server/auth/attempt-guard";
import { limiterKey, limiterRedis } from "@/server/security/rate-limit";

const SPEC = { lockAfter: 5, baseLockSec: 60, maxLockSec: 15 * 60, memorySec: 60 * 60 };
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
/** Limiter state outlives a test run: every test uses fresh keys. */
const key = (label: string): string => limiterKey(`test-guard:${label}:${randomUUID()}`);
const reserved = (d: AttemptDecision): number[] => {
  if (d.kind !== "reserved") throw new Error(`expected a reservation, got ${d.kind}`);
  return d.reservation.counts;
};

const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
afterAll(() => {
  down.disconnect();
});

describe("[P0-19] attempt guard: atomic check-and-reserve (B-CR-5)", () => {
  it("parallel attempts never get past the threshold: exactly lockAfter are reserved", async () => {
    const account = key("parallel");
    const decisions = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        reserveAttempt({ account, source: key(`p${String(i)}`), spec: SPEC, mode: "challenge" }),
      ),
    );
    const through = decisions.filter((d) => d.kind === "reserved");
    expect(through).toHaveLength(SPEC.lockAfter);
    expect(decisions.filter((d) => d.kind === "challenge")).toHaveLength(25 - SPEC.lockAfter);
    // Each reservation got a distinct count, so exactly one request owns "the lockout started".
    const counts = through.map((d) => reserved(d)[0]).sort();
    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });

  it("challenge mode: past the threshold only a human-checked attempt is reserved; refusals don't count", async () => {
    const account = key("challenge");
    for (let i = 0; i < SPEC.lockAfter; i++) {
      reserved(await reserveAttempt({ account, source: key("s"), spec: SPEC, mode: "challenge" }));
    }
    for (let i = 0; i < 3; i++) {
      expect(
        await reserveAttempt({ account, source: key("s"), spec: SPEC, mode: "challenge" }),
      ).toEqual({ kind: "challenge" });
    }
    const human = await reserveAttempt({
      account,
      source: key("s"),
      spec: SPEC,
      mode: "challenge",
      human: true,
    });
    expect(reserved(human)[0]).toBe(SPEC.lockAfter + 1); // the 3 refusals were not counted
  });

  it("a source (account + IP) locks with backoff even when it solves the check: 1 min, then doubling, capped at 15", async () => {
    const account = key("acct");
    const source = key("src");
    const go = (now: number) =>
      reserveAttempt({ account, source, spec: SPEC, mode: "challenge", human: true, now });
    for (let i = 0; i < SPEC.lockAfter; i++) reserved(await go(T0));
    expect(await go(T0 + 30_000)).toEqual({ kind: "locked", retryAfterSec: 30 });
    reserved(await go(T0 + 60_000)); // 6th failure: 2 minutes from now
    expect((await go(T0 + 60_000 + 119_000)).kind).toBe("locked");
    reserved(await go(T0 + 60_000 + 120_000));
    // Many more failures: never more than 15 minutes.
    let t = T0 + 200_000;
    for (let i = 0; i < 10; i++) {
      t += 16 * 60_000;
      reserved(await go(t));
    }
    expect(await go(t + 15 * 60_000 - 1000)).toEqual({ kind: "locked", retryAfterSec: 1 });
    expect((await go(t + 15 * 60_000)).kind).toBe("reserved");
  });

  it("another source is not affected by a locked source", async () => {
    const account = key("acct2");
    const attacker = key("attacker");
    for (let i = 0; i < SPEC.lockAfter; i++) {
      reserved(
        await reserveAttempt({ account, source: attacker, spec: SPEC, mode: "challenge", now: T0 }),
      );
    }
    expect(
      (
        await reserveAttempt({
          account,
          source: attacker,
          spec: SPEC,
          mode: "challenge",
          human: true,
          now: T0,
        })
      ).kind,
    ).toBe("locked");
    expect(
      (
        await reserveAttempt({
          account,
          source: key("owner"),
          spec: SPEC,
          mode: "challenge",
          human: true,
          now: T0,
        })
      ).kind,
    ).toBe("reserved");
  });

  it("lock mode (second factor): locks the account itself with backoff", async () => {
    const account = key("2fa");
    for (let i = 0; i < SPEC.lockAfter; i++) {
      reserved(await reserveAttempt({ account, spec: SPEC, mode: "lock", now: T0 }));
    }
    expect(await reserveAttempt({ account, spec: SPEC, mode: "lock", now: T0 + 1000 })).toEqual({
      kind: "locked",
      retryAfterSec: 59,
    });
    expect(
      (await reserveAttempt({ account, spec: SPEC, mode: "lock", now: T0 + 60_000 })).kind,
    ).toBe("reserved");
  });

  it("uses Redis time when no clock is injected (app hosts with skewed clocks agree)", async () => {
    const account = key("redis-time");
    for (let i = 0; i < SPEC.lockAfter; i++) {
      reserved(await reserveAttempt({ account, spec: SPEC, mode: "lock" }));
    }
    const [sec] = await limiterRedis().time();
    const last = Number(await limiterRedis().hget(account, "last"));
    expect(Math.abs(last - Number(sec) * 1000)).toBeLessThan(5_000);
    const locked = await reserveAttempt({ account, spec: SPEC, mode: "lock" });
    expect(locked.kind).toBe("locked");
  });

  it("release gives one slot back (never below zero); clear forgets the counters", async () => {
    const account = key("release");
    const source = key("release-src");
    const first = await reserveAttempt({ account, source, spec: SPEC, mode: "challenge" });
    if (first.kind !== "reserved") throw new Error("expected reservation");
    await releaseAttempt(first.reservation);
    await releaseAttempt(first.reservation);
    expect(await limiterRedis().hget(account, "count")).toBe("0");
    for (let i = 0; i < SPEC.lockAfter; i++) {
      reserved(await reserveAttempt({ account, source, spec: SPEC, mode: "challenge" }));
    }
    await clearAttempts([account, source]);
    expect(
      reserved(await reserveAttempt({ account, source, spec: SPEC, mode: "challenge" })),
    ).toEqual([1, 1]);
  });

  it("forgets failures memorySec after the last one", async () => {
    const account = key("memory");
    reserved(await reserveAttempt({ account, spec: { ...SPEC, memorySec: 1 }, mode: "lock" }));
    expect(await limiterRedis().pttl(account)).toBeLessThanOrEqual(1000);
  });

  it("Redis down: throws AttemptGuardUnavailable (callers fail closed)", async () => {
    await expect(
      reserveAttempt({ account: key("down"), spec: SPEC, mode: "challenge", redis: down }),
    ).rejects.toBeInstanceOf(AttemptGuardUnavailable);
  });
});
