import "server-only";
import { hostname } from "node:os";
import { env } from "@/server/env";
import type { Redis } from "ioredis";

/**
 * Open realtime streams per web process, for the admin System page (P1-10). Each process writes its count to
 * redis-cache on every heartbeat with a TTL, so a stopped process drops out on its own; the worker's health
 * monitor sums them. Fail-quiet both ways: a count is information, never a reason to fail.
 */
export const PRESENCE_TTL_SEC = 75;

const prefix = (): string => `${env().REDIS_KEY_PREFIX}rt:count:`;
const instance = `${hostname()}:${String(process.pid)}`;

export async function reportConnections(redis: Redis, count: number): Promise<void> {
  await redis.set(`${prefix()}${instance}`, String(count), "EX", PRESENCE_TTL_SEC);
}

export async function realtimeConnections(redis: Redis): Promise<number> {
  let cursor = "0";
  let total = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix()}*`, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) {
      for (const v of await redis.mget(...keys)) total += Number(v ?? 0) || 0;
    }
  } while (cursor !== "0");
  return total;
}
