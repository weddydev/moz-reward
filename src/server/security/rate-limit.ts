import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { createRedis } from "@/server/jobs/connection";
import { log } from "@/server/log";
import { ipBucket } from "./ip-bucket";
import type { Redis } from "ioredis";

/**
 * Redis sliding-window rate limiter (P0-05, SECURITY §6). One sorted set per key holds the timestamps of the
 * accepted hits inside the window; a Lua script trims, counts and records atomically, so concurrent requests
 * can't overshoot. Blocked attempts are not recorded (hammering doesn't extend a lockout). Keys expire with
 * the window.
 *
 * Redis down: fails **open** by default (logged at error level) so an outage doesn't lock every user out;
 * pass `onError: "closed"` where abuse is costlier than availability.
 */
export type LimitResult = { ok: boolean; remaining: number; resetAt: Date; degraded?: true };
export type LimitOptions = {
  key: string;
  max: number;
  windowSec: number;
  /** Injectable clock (ms) for deterministic tests. */
  now?: number;
  onError?: "open" | "closed";
};

// KEYS[1] zset; ARGV: now, windowMs, max, member. Returns {ok(0|1), count after, oldest score}.
const SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
local ok = 0
if count < max then
  redis.call('ZADD', key, now, ARGV[4])
  count = count + 1
  ok = 1
end
redis.call('PEXPIRE', key, window)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2] or now
return {ok, count, tonumber(oldest)}
`;

type Limiter = (opts: LimitOptions) => Promise<LimitResult>;

export function createLimiter(redis: Redis): Limiter {
  return async ({ key, max, windowSec, now = Date.now(), onError = "open" }) => {
    const windowMs = windowSec * 1000;
    try {
      const [ok, count, oldest] = (await redis.eval(
        SCRIPT,
        1,
        `${env().REDIS_KEY_PREFIX}rl:${key}`,
        now,
        windowMs,
        max,
        `${String(now)}:${randomUUID()}`,
      )) as [number, number, number];
      return {
        ok: ok === 1,
        remaining: Math.max(0, max - count),
        resetAt: new Date(oldest + windowMs),
      };
    } catch (err) {
      log().error({ err, limiterKey: key.split(":")[0], onError }, "rate limiter unavailable");
      return {
        ok: onError === "open",
        remaining: 0,
        resetAt: new Date(now + windowMs),
        degraded: true,
      };
    }
  };
}

const state = ((
  globalThis as { __mozLimiter?: { redis?: Redis; limiter?: Limiter } }
).__mozLimiter ??= {});

/** The limiter's connection (`limiter` role: short queue while connecting, 750 ms command deadline). */
export function limiterRedis(): Redis {
  state.redis ??= createRedis("limiter");
  return state.redis;
}

/** Shared limiter on the limiter connection. */
export const limit: Limiter = (opts) => {
  state.limiter ??= createLimiter(limiterRedis());
  return state.limiter(opts);
};

/** Redis key for limiter-owned state, under the same prefix as the limits. */
export const limiterKey = (key: string): string => `${env().REDIS_KEY_PREFIX}rl:${key}`;

export async function closeLimiter(): Promise<void> {
  await state.redis?.quit();
  delete state.redis;
  delete state.limiter;
}

/** Per-IP key. Get the IP from `clientIp()` (never straight from X-Forwarded-For); IPv6 keys on its /64. */
export const ipKey = (scope: string, ip: string): string => `${scope}:ip:${ipBucket(ip)}`;
/** Per-user (or per-email, normalised by the caller) key. */
export const userKey = (scope: string, id: string): string => `${scope}:user:${id}`;

/**
 * `clientIp()` results that are not a real address. "local": no trusted proxy (local/test only; env.ts refuses
 * TRUSTED_PROXY=none in staging/production), so every request shares it and per-IP limits are skipped there.
 * "unknown": a trusted proxy is configured but sent no valid address.
 */
export const LOCAL_IP = "local";
export const UNKNOWN_IP = "unknown";
/** An unknown client IP shares one bucket with this fraction of the per-IP allowance (SECURITY §6). */
export const UNKNOWN_IP_DIVISOR = 4;

/**
 * Per-IP limit for `ip` (SECURITY §6): a real address gets its own bucket; every "unknown" request shares one
 * strict bucket (a quarter of the allowance, at least 1), so a missing address is never a bypass. Returns
 * null for "local" — callers skip the per-IP limit there.
 */
export function ipLimit(
  scope: string,
  ip: string,
  spec: { max: number; windowSec: number },
): Pick<LimitOptions, "key" | "max" | "windowSec"> | null {
  if (ip === LOCAL_IP) return null;
  if (ip === UNKNOWN_IP) {
    return {
      key: ipKey(scope, UNKNOWN_IP),
      max: Math.max(1, Math.floor(spec.max / UNKNOWN_IP_DIVISOR)),
      windowSec: spec.windowSec,
    };
  }
  return { key: ipKey(scope, ip), ...spec };
}

export const retryAfterSec = (r: LimitResult): number =>
  Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));

/** For server actions: throws RATE_LIMITED (mapped to a 429 / form error by the action template). */
export async function limitOrThrow(opts: LimitOptions): Promise<LimitResult> {
  const result = await limit(opts);
  if (!result.ok) {
    const wait = retryAfterSec(result);
    throw new AppError(
      "RATE_LIMITED",
      `Too many attempts. Please try again in ${humanWait(wait)}.`,
      undefined,
      { retryAfterSec: wait },
    );
  }
  return result;
}

/** For route handlers: a 429 with Retry-After. */
export function tooManyRequests(result: LimitResult): Response {
  return Response.json(
    { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." } },
    { status: 429, headers: { "Retry-After": String(retryAfterSec(result)) } },
  );
}

/** "a minute", "5 minutes", "2 hours" — for user-facing wait messages. */
export function humanWait(sec: number): string {
  const min = Math.ceil(sec / 60);
  if (min <= 1) return "a minute";
  if (min < 60) return `${String(min)} minutes`;
  const hours = Math.ceil(min / 60);
  return hours === 1 ? "an hour" : `${String(hours)} hours`;
}
