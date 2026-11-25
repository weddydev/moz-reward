import "server-only";
import { asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { CustomerScope, ShopScope, SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { memberships, notifications, shopStaff } from "@/server/db/schema";
import type { NotificationCategory } from "@/server/db/schema/notifications";
import { inShop, ownedBy, withScope } from "./_base";

/**
 * Notifications and the membership lookups realtime publishing checks targets with (P1-10). Inserts happen in
 * the producer's transaction (`notify()`); RLS lets a shop's team insert only for its own members or staff.
 */
export type NotificationRow = {
  id: string;
  userId: string;
  shopId: string | null;
  type: string;
  category: NotificationCategory;
  payload: Record<string, unknown>;
  /** Fixed for deterministic (idempotent) notices; otherwise the database's now(). */
  createdAt?: Date;
};

/**
 * Inserts rows; a row whose (id, created_at) already exists is skipped (idempotent notices). No RETURNING: a
 * shop scope may insert but not read the rows it wrote (security design check M3).
 */
export async function insertNotifications(
  scope: ShopScope | CustomerScope | SystemScope,
  tx: Transaction,
  rows: readonly NotificationRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await withScope(
    scope,
    (q) =>
      q
        .insert(notifications)
        .values(rows.map((r) => ({ ...r })))
        .onConflictDoNothing(),
    tx,
  );
}

/** The ids among `userIds` who are members (current or past) or active staff of the scope's shop. */
export async function shopAudience(
  scope: ShopScope,
  tx: Transaction,
  userIds: readonly string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const [members, staff] = await withScope(
    scope,
    (q) =>
      Promise.all([
        q
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(inShop(memberships.shopId, scope, inArray(memberships.userId, [...userIds]))),
        q
          .select({ userId: shopStaff.userId })
          .from(shopStaff)
          .where(
            inShop(
              shopStaff.shopId,
              scope,
              inArray(shopStaff.userId, [...userIds]),
              eq(shopStaff.active, true),
            ),
          ),
      ]),
    tx,
  );
  return new Set([...members, ...staff].map((r) => r.userId));
}

/** The ids among `shopIds` where the customer has a current membership. */
export async function ownMemberShops(
  scope: CustomerScope,
  tx: Transaction,
  shopIds: readonly string[],
): Promise<Set<string>> {
  if (shopIds.length === 0) return new Set();
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({ shopId: memberships.shopId })
        .from(memberships)
        .where(
          ownedBy(
            memberships.userId,
            scope,
            inArray(memberships.shopId, [...shopIds]),
            isNull(memberships.leftAt),
          ),
        ),
    tx,
  );
  return new Set(rows.map((r) => r.shopId));
}

/** One keyset page of the shop's current members' user ids (left members excluded), ascending. */
export async function currentMemberPage(
  scope: ShopScope,
  tx: Transaction,
  afterUserId: string | null,
  limit: number,
): Promise<string[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          inShop(
            memberships.shopId,
            scope,
            isNull(memberships.leftAt),
            afterUserId ? gt(memberships.userId, afterUserId) : undefined,
          ),
        )
        .orderBy(asc(memberships.userId))
        .limit(limit),
    tx,
  );
  return rows.map((r) => r.userId);
}

/** The recipient's own notifications, newest first (the inbox UI arrives with P3-07). */
export async function listOwnNotifications(
  scope: CustomerScope,
  limit = 20,
): Promise<
  Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    readAt: Date | null;
    createdAt: Date;
  }>
> {
  return withScope(scope, (q) =>
    q
      .select({
        id: notifications.id,
        type: notifications.type,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(ownedBy(notifications.userId, scope))
      .orderBy(sql`${notifications.createdAt} DESC`)
      .limit(limit),
  );
}

/** Creates this month's and the next `months` monthly partitions if missing (worker only); returns how many. */
export async function ensureNotificationPartitions(
  scope: SystemScope,
  months: number,
): Promise<number> {
  const [row] = await withScope(scope, (q) =>
    q.execute<{ created: number }>(
      sql`SELECT public.ensure_notifications_partitions(${months}) AS created`,
    ),
  );
  return row?.created ?? 0;
}

/** How many whole months after the current one already have a notifications partition (health monitor). */
export async function notificationMonthsAhead(scope: SystemScope): Promise<number> {
  const rows = await withScope(scope, (q) =>
    q.execute<{ name: string }>(sql`
      SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'public.notifications'::regclass`),
  );
  const have = new Set([...rows].map((r) => r.name));
  const now = new Date();
  let ahead = 0;
  for (let i = 1; i <= 12; i++) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const name = `notifications_${String(m.getUTCFullYear())}${String(m.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!have.has(name)) break;
    ahead = i;
  }
  return ahead;
}
