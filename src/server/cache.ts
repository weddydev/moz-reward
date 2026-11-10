import "server-only";
import { env } from "@/server/env";
import { createRedis } from "@/server/jobs/connection";
import { log } from "@/server/log";
import type { Redis } from "ioredis";

/**
 * Data cache on redis-cache (P0-18, ARCHITECTURE §5): hot public reads (shop landing, offers feed) keep their
 * data here for a few seconds, never their HTML. **Fails open**: if the cache is down or slow (250 ms
 * deadline), the loader runs and the page still renders (SECURITY §6: public reads fail open). Values are
 * JSON; never put personal data or secrets in a shared cache.
 */
const state = ((globalThis as { __mozCache?: { redis?: Redis } }).__mozCache ??= {});

export function cacheRedis(): Redis {
  state.redis ??= createRedis("cache");
  return state.redis;
}

export async function closeCache(): Promise<void> {
  await state.redis?.quit();
  delete state.redis;
}

export const cacheKey = (key: string): string => `${env().REDIS_KEY_PREFIX}cache:${key}`;

export async function cached<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
  redis: Redis = cacheRedis(),
): Promise<T> {
  const full = cacheKey(key);
  try {
    const hit = await redis.get(full);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch (err) {
    log().warn({ err, cacheKey: key }, "cache unavailable: reading through (fail open)");
    return loader();
  }
  const value = await loader();
  redis.set(full, JSON.stringify(value), "EX", ttlSec).catch((err: unknown) => {
    log().warn({ err, cacheKey: key }, "cache write failed");
  });
  return value;
}
