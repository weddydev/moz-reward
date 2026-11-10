import "server-only";
import { londonDay } from "@/lib/format-date";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { limiterRedis } from "@/server/security/rate-limit";
import type { Redis } from "ioredis";

/**
 * Free-tier usage counters (P0-13, ARCHITECTURE §10: "every quota has an alert at 70%"). Kept in redis-queue
 * (never evicted), bumped fire-and-forget: a counter that fails to count must never fail the send.
 *  - email: messages handed to a provider today (UK day; the providers' daily caps).
 *  - sentry: error events we sent this calendar month (an approximation of Sentry's billing month; Sentry may
 *    still drop some, so this errs high — the safe side for a quota alert).
 */
const DAY_TTL_SEC = 3 * 24 * 60 * 60;
const MONTH_TTL_SEC = 40 * 24 * 60 * 60;

const emailKey = (day: string): string => `${env().REDIS_KEY_PREFIX}usage:email:${day}`;
const sentryKey = (month: string): string => `${env().REDIS_KEY_PREFIX}usage:sentry:${month}`;
const monthOf = (date: Date): string => londonDay(date).slice(0, 7);

function bump(key: string, ttlSec: number, redis: Redis): void {
  void redis
    .multi()
    .incr(key)
    .expire(key, ttlSec)
    .exec()
    .catch((err: unknown) => {
      log().warn({ err, counter: key.split(":").slice(-2, -1)[0] }, "usage counter not updated");
    });
}

export function countEmailSent(now = new Date(), redis: Redis = limiterRedis()): void {
  bump(emailKey(londonDay(now)), DAY_TTL_SEC, redis);
}

export function countSentryEvent(now = new Date(), redis: Redis = limiterRedis()): void {
  bump(sentryKey(monthOf(now)), MONTH_TTL_SEC, redis);
}

export async function readUsage(
  now = new Date(),
  redis: Redis = limiterRedis(),
): Promise<{ emailToday: number; sentryMonth: number }> {
  const [email, sentry] = await redis.mget(emailKey(londonDay(now)), sentryKey(monthOf(now)));
  return { emailToday: Number(email ?? 0), sentryMonth: Number(sentry ?? 0) };
}
