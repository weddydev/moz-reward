import "server-only";
import { Redis } from "ioredis";
import { env } from "@/server/env";

/**
 * Redis connections for BullMQ (P0-04). Workers block on Redis and must retry forever
 * (`maxRetriesPerRequest: null`, a BullMQ requirement). Producers fail fast instead (no offline queue), so a
 * request never hangs when Redis is down. Keys are namespaced by REDIS_KEY_PREFIX (per test worker).
 */
export type ConnectionRole = "producer" | "worker" | "limiter";

export function createRedis(role: ConnectionRole): Redis {
  if (role === "limiter") {
    // On the request path: commands queue briefly while the connection comes up (the first request after
    // start-up must not be refused), but every command has a hard deadline so a request never hangs.
    return new Redis(env().REDIS_URL, {
      connectionName: "moz:limiter",
      maxRetriesPerRequest: 1,
      enableOfflineQueue: true,
      commandTimeout: 750,
      connectTimeout: 2_000,
    });
  }
  return new Redis(env().REDIS_URL, {
    connectionName: `moz:${role}`,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    connectTimeout: 5_000,
  });
}

export const bullPrefix = (): string => `${env().REDIS_KEY_PREFIX}bull`;
