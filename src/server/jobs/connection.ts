import "server-only";
import { Redis } from "ioredis";
import { env } from "@/server/env";

/**
 * Redis connections for BullMQ (P0-04). Workers block on Redis and must retry forever
 * (`maxRetriesPerRequest: null`, a BullMQ requirement). Producers fail fast instead (no offline queue), so a
 * request never hangs when Redis is down. Keys are namespaced by REDIS_KEY_PREFIX (per test worker).
 */
export type ConnectionRole = "producer" | "worker";

export function createRedis(role: ConnectionRole): Redis {
  return new Redis(env().REDIS_URL, {
    connectionName: `moz:${role}`,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    connectTimeout: 5_000,
  });
}

export const bullPrefix = (): string => `${env().REDIS_KEY_PREFIX}bull`;
