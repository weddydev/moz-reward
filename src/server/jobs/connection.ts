import "server-only";
import { Redis } from "ioredis";
import { env } from "@/server/env";

/**
 * Redis connections (P0-04, split in P0-18). Two instances, never mixed (ARCHITECTURE §6, §9):
 * - **redis-queue** (`REDIS_URL`, `noeviction`): BullMQ (producer/worker) and the rate limiter. Nothing here
 *   may ever be evicted.
 * - **redis-cache** (`REDIS_CACHE_URL`, `allkeys-lru`): the data cache and pub/sub. Filling it evicts only
 *   cache entries.
 * Workers block on Redis and retry forever (`maxRetriesPerRequest: null`, a BullMQ requirement). Producers
 * fail fast with a command deadline, so a request never hangs when Redis is down. Keys are namespaced by
 * REDIS_KEY_PREFIX (per test worker).
 */
export type ConnectionRole = "producer" | "worker" | "limiter" | "cache";

/** Local/test default for the cache instance (infra/docker-compose.dev.yml); required elsewhere (env.ts). */
const LOCAL_CACHE_URL = "redis://:moz@localhost:6380";
export const cacheUrl = (): string => env().REDIS_CACHE_URL ?? LOCAL_CACHE_URL;

export function createRedis(role: ConnectionRole): Redis {
  if (role === "limiter" || role === "cache") {
    // On the request path: commands queue briefly while the connection comes up (the first request after
    // start-up must not be refused), but every command has a hard deadline so a request never hangs.
    return new Redis(role === "cache" ? cacheUrl() : env().REDIS_URL, {
      connectionName: `moz:${role}`,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      commandTimeout: role === "cache" ? 250 : 750,
      connectTimeout: 2_000,
    });
  }
  return new Redis(env().REDIS_URL, {
    connectionName: `moz:${role}`,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    connectTimeout: 5_000,
    // CR-M3 (C-11): an enqueue never waits more than 2 s on Redis (the outbox relay retries it later).
    ...(role === "producer" ? { commandTimeout: 2_000 } : {}),
  });
}

export const bullPrefix = (): string => `${env().REDIS_KEY_PREFIX}bull`;
