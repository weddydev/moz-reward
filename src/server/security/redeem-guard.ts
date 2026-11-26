import "server-only";
import { randomUUID } from "node:crypto";
import { REDEEM } from "@/lib/loyalty/redeem";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { limiterRedis } from "@/server/security/rate-limit";
import type { Redis } from "ioredis";

/**
 * The redeem-code guessing guard (P1-16; SECURITY §6 "Redeem / claim code confirm"; design check 27 Nov).
 *
 * The rule: in any 24 h, the chance that someone at a shop guesses any of its live codes stays below 1 in
 * 1,000,000. One attempt against a shop with L live codes hits with probability L / 30^6, so the guard keeps, per
 * shop, the sum of each attempt's weight w = max(L, 1) + 1 over a sliding 24 h within `REDEEM.shopGuessBudget`
 * (700 < 729 = 1e-6 × 30^6; union bound). The +1 covers a code made between the count and the lookup, and the
 * floor of 1 makes every wrong code count even when nothing is live. Per team member: after 5 attempts a lock of
 * 1 min doubling to 1 h, and at most a third of the shop's budget, so one person can't use up the shop's day
 * (insider DoS; the owner is told when the shop's budget runs out).
 *
 * Every attempt is reserved before the lookup, in one Lua script (lock check, both budgets, reservation), on
 * Redis time. Only a confirm that committed gives its reservation back (`releaseRedeemAttempt`); a wrong, expired,
 * voided, already-redeemed or other-shop code, and any error, keep it. Redis down → `RedeemGuardUnavailable`
 * (the action answers 503: money endpoint, fails closed). Keys live on the limiter connection (redis queue
 * instance: noeviction, AOF), so a cache flush can't reset them.
 */
export const REDEEM_GUARD = {
  windowSec: 24 * 60 * 60,
  staffLockAfter: 5,
  staffBaseLockSec: 60,
  staffMaxLockSec: 60 * 60,
  /** One team member's share of the shop's daily budget. */
  staffShare: Math.floor(REDEEM.shopGuessBudget / 3),
} as const;

/** The weight of one attempt against a shop with `liveCodes` live codes. */
export const attemptWeight = (liveCodes: number): number => Math.max(liveCodes, 1) + 1;

export type RedeemReservation = { keys: string[]; member: string };
export type RedeemGuardDecision =
  | { kind: "reserved"; reservation: RedeemReservation }
  | { kind: "staff_locked"; retryAfterSec: number }
  | { kind: "staff_share"; retryAfterSec: number }
  | { kind: "shop_exhausted"; retryAfterSec: number; firstRefusal: boolean };

export class RedeemGuardUnavailable extends Error {
  constructor(cause: unknown) {
    super("redeem guard unavailable", { cause });
    this.name = "RedeemGuardUnavailable";
  }
}

// KEYS[1] staff hash {count,last}, KEYS[2] staff zset, KEYS[3] shop zset, KEYS[4] shop "told the owner" flag.
// zset members are "<uuid>:<weight>", scored by time. ARGV: now ('' = Redis TIME), weight, budget, share,
// lockAfter, baseMs, maxMs, windowMs, uuid. Returns {decision, retryMs, first}.
const RESERVE = `
local now = tonumber(ARGV[1])
if not now then
  local t = redis.call('TIME')
  now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
end
local w = tonumber(ARGV[2])
local budget = tonumber(ARGV[3])
local share = tonumber(ARGV[4])
local after = tonumber(ARGV[5])
local base = tonumber(ARGV[6])
local maxMs = tonumber(ARGV[7])
local window = tonumber(ARGV[8])
local v = redis.call('HMGET', KEYS[1], 'count', 'last')
local count = tonumber(v[1]) or 0
if count >= after then
  local untilMs = (tonumber(v[2]) or 0) + math.min(maxMs, base * 2 ^ (count - after))
  if now < untilMs then return {'staff_locked', untilMs - now, 0} end
end
local function total(key)
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  local sum = 0
  for _, m in ipairs(redis.call('ZRANGE', key, 0, -1)) do
    sum = sum + tonumber(string.match(m, ':(%d+)$'))
  end
  return sum
end
local function freesIn(key)
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
  return oldest and (tonumber(oldest) + window - now) or window
end
if total(KEYS[3]) + w > budget then
  local first = redis.call('SET', KEYS[4], '1', 'NX', 'PX', window) and 1 or 0
  return {'shop_exhausted', freesIn(KEYS[3]), first}
end
if total(KEYS[2]) + w > share then return {'staff_share', freesIn(KEYS[2]), 0} end
local member = ARGV[9] .. ':' .. ARGV[2]
redis.call('ZADD', KEYS[3], now, member)
redis.call('ZADD', KEYS[2], now, member)
redis.call('HINCRBY', KEYS[1], 'count', 1)
redis.call('HSET', KEYS[1], 'last', now)
for i = 1, 3 do redis.call('PEXPIRE', KEYS[i], window) end
return {'ok', 0, 0}
`;

// A committed confirm: drop its weight from both budgets and give back its lock count (never below zero).
const RELEASE = `
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('ZREM', KEYS[3], ARGV[1])
if (tonumber(redis.call('HGET', KEYS[1], 'count')) or 0) > 0 then redis.call('HINCRBY', KEYS[1], 'count', -1) end
return 1
`;

const keysFor = (shopId: string, staffId: string): string[] => {
  const p = `${env().REDIS_KEY_PREFIX}redeem:`;
  return [
    `${p}staff:${shopId}:${staffId}:lock`,
    `${p}staff:${shopId}:${staffId}:spent`,
    `${p}shop:${shopId}:spent`,
    `${p}shop:${shopId}:told`,
  ];
};

const seconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

export async function reserveRedeemAttempt(opts: {
  shopId: string;
  staffId: string;
  liveCodes: number;
  /** Tests only: an injected clock (ms); production uses Redis time. */
  now?: number;
  redis?: Redis;
}): Promise<RedeemGuardDecision> {
  const keys = keysFor(opts.shopId, opts.staffId);
  const weight = attemptWeight(opts.liveCodes);
  const id = randomUUID();
  let raw: [string, number, number];
  try {
    raw = (await (opts.redis ?? limiterRedis()).eval(
      RESERVE,
      keys.length,
      ...keys,
      opts.now === undefined ? "" : String(opts.now),
      weight,
      REDEEM.shopGuessBudget,
      REDEEM_GUARD.staffShare,
      REDEEM_GUARD.staffLockAfter,
      REDEEM_GUARD.staffBaseLockSec * 1000,
      REDEEM_GUARD.staffMaxLockSec * 1000,
      REDEEM_GUARD.windowSec * 1000,
      id,
    )) as [string, number, number];
  } catch (err) {
    log().error({ err }, "redeem guard unavailable");
    throw new RedeemGuardUnavailable(err);
  }
  const [decision, retryMs, first] = raw;
  switch (decision) {
    case "staff_locked":
      return { kind: "staff_locked", retryAfterSec: seconds(retryMs) };
    case "staff_share":
      return { kind: "staff_share", retryAfterSec: seconds(retryMs) };
    case "shop_exhausted":
      return { kind: "shop_exhausted", retryAfterSec: seconds(retryMs), firstRefusal: first === 1 };
    default:
      return {
        kind: "reserved",
        reservation: { keys: keys.slice(0, 3), member: `${id}:${String(weight)}` },
      };
  }
}

/** After a confirm committed (the code was right): its attempt was not a failed guess. */
export async function releaseRedeemAttempt(r: RedeemReservation, redis?: Redis): Promise<void> {
  try {
    await (redis ?? limiterRedis()).eval(RELEASE, r.keys.length, ...r.keys, r.member);
  } catch (err) {
    log().error({ err }, "redeem guard release failed");
  }
}
