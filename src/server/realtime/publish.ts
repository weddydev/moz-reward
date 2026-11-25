import "server-only";
import type { CustomerScope, ShopScope, SystemScope } from "@/server/authz/scope";
import { cacheRedis } from "@/server/cache";
import type { Transaction } from "@/server/db/client";
import { env } from "@/server/env";
import { writeOutbox } from "@/server/jobs/outbox";
import { ownMemberShops, shopAudience } from "@/server/repos/notifications";
import { parseRealtimeEvent, type RealtimeEvent, type RealtimeTarget } from "./events";
import type { Redis } from "ioredis";

/**
 * Realtime publishing (P1-10). Request and job code never touches Redis here: `publishRealtime` writes an outbox
 * row in the caller's transaction (so a rolled-back change sends no event) and the worker publishes it. Targets
 * are checked inside that transaction (security design check M7), so a request can only hint its own channels:
 *  - customer → its own `user:` channel, or `shop:X` where it has a current membership;
 *  - shop team → its own `shop:` channel, or `user:U` for its own members/staff;
 *  - system (jobs) → anything; the event schema still applies.
 * An event that names a shop must name the target shop (and, for a team, its own).
 */
export const MAX_TARGETS = 100;

export class RealtimeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealtimeTargetError";
  }
}

const eventShop = (event: RealtimeEvent): string | null =>
  "shopId" in event.data ? event.data.shopId : null;

async function checkTargets(
  scope: CustomerScope | ShopScope | SystemScope,
  tx: Transaction,
  targets: readonly RealtimeTarget[],
  event: RealtimeEvent,
): Promise<void> {
  const shop = eventShop(event);
  for (const t of targets) {
    if (t.kind === "shop" && shop !== null && shop !== t.id) {
      throw new RealtimeTargetError("event names a different shop than its target");
    }
  }
  if (scope.kind === "system") return;
  const users = targets.filter((t) => t.kind === "user").map((t) => t.id);
  const shops = targets.filter((t) => t.kind === "shop").map((t) => t.id);
  if (scope.kind === "customer") {
    if (users.some((u) => u !== scope.userId)) {
      throw new RealtimeTargetError("a customer may only hint its own user channel");
    }
    const mine = await ownMemberShops(scope, tx, shops);
    if (shops.some((s) => !mine.has(s))) {
      throw new RealtimeTargetError("a customer may only hint shops it is a member of");
    }
    return;
  }
  if (shops.some((s) => s !== scope.shopId) || (shop !== null && shop !== scope.shopId)) {
    throw new RealtimeTargetError("a shop team may only hint its own shop");
  }
  const audience = await shopAudience(scope, tx, users);
  if (users.some((u) => !audience.has(u))) {
    throw new RealtimeTargetError("a shop team may only hint its own members and staff");
  }
}

/** Queues `event` for `targets` (≤ 100) in the caller's transaction. */
export async function publishRealtime(
  scope: CustomerScope | ShopScope | SystemScope,
  tx: Transaction,
  targets: readonly RealtimeTarget[],
  event: RealtimeEvent,
): Promise<void> {
  if (targets.length === 0) return;
  if (targets.length > MAX_TARGETS) throw new RealtimeTargetError("too many targets in one event");
  const valid = parseRealtimeEvent(event);
  if (!valid) throw new RealtimeTargetError("invalid realtime event");
  await checkTargets(scope, tx, targets, valid);
  const payload = { targets: [...targets], event: valid };
  if (scope.kind === "system") {
    await writeOutbox(scope, tx, "notifications", "publish-system", payload);
  } else {
    await writeOutbox(scope, tx, "notifications", "publish", payload);
  }
}

export const realtimeChannel = (t: RealtimeTarget, prefix = env().REDIS_KEY_PREFIX): string =>
  `${prefix}rt:${t.kind}:${t.id}`;

/**
 * Worker side: PUBLISH to redis-cache. Throws when Redis refuses, so the job retries (then dead-letters); a lost
 * hint only delays a refresh, the client's refetch on reconnect is the backstop.
 */
export async function deliverRealtime(
  payload: { targets: RealtimeTarget[]; event: unknown },
  redis: Redis = cacheRedis(),
): Promise<number> {
  const event = parseRealtimeEvent(payload.event);
  if (!event) throw new Error("realtime publish: invalid event");
  const message = JSON.stringify(event);
  let receivers = 0;
  for (const t of payload.targets) receivers += await redis.publish(realtimeChannel(t), message);
  return receivers;
}
