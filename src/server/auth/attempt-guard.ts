import "server-only";
import { log } from "@/server/log";
import { limiterRedis } from "@/server/security/rate-limit";
import type { Redis } from "ioredis";

/**
 * Atomic check-and-reserve for credential attempts (P0-19, SECURITY §2 and §6; review items B-SEC-5, B-CR-5).
 *
 * Before a password or second-factor code is checked, `reserveAttempt` decides **and** counts the attempt in
 * one Lua script, so parallel requests can never let more than `lockAfter` attempts through (the old code read
 * the counter, then wrote it, in two steps). The caller then settles the reservation: a wrong credential
 * keeps it (it was the failure), a correct one clears the counters, anything else releases it.
 *
 * Two counters:
 * - **account** (`KEYS[1]`): every attempt on the account, from anywhere. Past `lockAfter` it either demands a
 *   human check (`mode: "challenge"`, password sign-in: a locked account asks for Turnstile instead of
 *   refusing, so nobody can hold it locked) or locks with backoff (`mode: "lock"`, second factor: whoever is
 *   there already knows the password).
 * - **source** (`KEYS[2]`, optional): the account from one IP. Past `lockAfter` that source alone is locked
 *   with backoff (1 min doubling to the cap), whether or not it solves Turnstile.
 *
 * Time comes from Redis (`TIME`) unless a test injects `now`, so app hosts with skewed clocks agree on when a
 * lock ends. Counters are forgotten `memorySec` after the last attempt. Redis errors throw
 * `AttemptGuardUnavailable`: auth fails closed (the caller answers 503).
 */
export type AttemptSpec = {
  lockAfter: number;
  baseLockSec: number;
  maxLockSec: number;
  memorySec: number;
};

/** Counts after this attempt was reserved: `[account, source?]`. */
export type Reservation = { keys: string[]; counts: number[] };

export type AttemptDecision =
  | { kind: "reserved"; reservation: Reservation }
  | { kind: "locked"; retryAfterSec: number }
  | { kind: "challenge" };

export class AttemptGuardUnavailable extends Error {
  constructor(cause: unknown) {
    super("attempt guard unavailable", { cause });
    this.name = "AttemptGuardUnavailable";
  }
}

// KEYS[1] account hash, KEYS[2] optional source hash (fields: count, last).
// ARGV: now ('' = Redis TIME), lockAfter, baseMs, maxMs, memoryMs, mode ('challenge'|'lock'), human ('1'|'0').
// Returns {decision, retryMs, accountCount, sourceCount}.
const RESERVE = `
local now = tonumber(ARGV[1])
if not now then
  local t = redis.call('TIME')
  now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
end
local after = tonumber(ARGV[2])
local base = tonumber(ARGV[3])
local maxMs = tonumber(ARGV[4])
local memory = tonumber(ARGV[5])
local function state(key)
  local v = redis.call('HMGET', key, 'count', 'last')
  local count = tonumber(v[1]) or 0
  if count < after then return count, 0 end
  local lockMs = math.min(maxMs, base * 2 ^ (count - after))
  return count, (tonumber(v[2]) or 0) + lockMs
end
if KEYS[2] then
  local _, sourceUntil = state(KEYS[2])
  if now < sourceUntil then return {'locked', sourceUntil - now, 0, 0} end
end
local count, accountUntil = state(KEYS[1])
if count >= after then
  if ARGV[6] == 'lock' then
    if now < accountUntil then return {'locked', accountUntil - now, 0, 0} end
  elseif ARGV[7] ~= '1' then
    return {'challenge', 0, 0, 0}
  end
end
local counts = {}
for i, key in ipairs(KEYS) do
  counts[i] = redis.call('HINCRBY', key, 'count', 1)
  redis.call('HSET', key, 'last', now)
  redis.call('PEXPIRE', key, memory)
end
return {'ok', 0, counts[1], counts[2] or 0}
`;

// Give back one reserved attempt (never below zero, never re-creating an expired key).
const RELEASE = `
for _, key in ipairs(KEYS) do
  if (tonumber(redis.call('HGET', key, 'count')) or 0) > 0 then redis.call('HINCRBY', key, 'count', -1) end
end
return 1
`;

export async function reserveAttempt(opts: {
  account: string;
  source?: string;
  spec: AttemptSpec;
  mode: "challenge" | "lock";
  /** Turnstile was solved for this request (only matters in "challenge" mode). */
  human?: boolean;
  /** Injectable clock (ms) for deterministic tests; production uses Redis time. */
  now?: number;
  redis?: Redis;
}): Promise<AttemptDecision> {
  const keys = opts.source ? [opts.account, opts.source] : [opts.account];
  const { spec } = opts;
  let raw: [string, number, number, number];
  try {
    raw = (await (opts.redis ?? limiterRedis()).eval(
      RESERVE,
      keys.length,
      ...keys,
      opts.now === undefined ? "" : String(opts.now),
      spec.lockAfter,
      spec.baseLockSec * 1000,
      spec.maxLockSec * 1000,
      spec.memorySec * 1000,
      opts.mode,
      opts.human ? "1" : "0",
    )) as [string, number, number, number];
  } catch (err) {
    log().error({ err }, "attempt guard unavailable");
    throw new AttemptGuardUnavailable(err);
  }
  const [decision, retryMs, accountCount, sourceCount] = raw;
  if (decision === "locked") {
    return { kind: "locked", retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
  }
  if (decision === "challenge") return { kind: "challenge" };
  return {
    kind: "reserved",
    reservation: { keys, counts: opts.source ? [accountCount, sourceCount] : [accountCount] },
  };
}

/** The attempt ended without checking the credential (e.g. a validation error): give the slot back. */
export async function releaseAttempt(reservation: Reservation, redis?: Redis): Promise<void> {
  try {
    await (redis ?? limiterRedis()).eval(RELEASE, reservation.keys.length, ...reservation.keys);
  } catch (err) {
    log().error({ err }, "attempt guard release failed");
  }
}

/** A correct credential: forget the failures on these counters. */
export async function clearAttempts(keys: string[], redis?: Redis): Promise<void> {
  if (keys.length === 0) return;
  try {
    await (redis ?? limiterRedis()).del(...keys);
  } catch (err) {
    log().error({ err }, "attempt guard clear failed");
  }
}
