import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { MemberId } from "@/lib/brand";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { pointRequests } from "@/server/db/schema";
import { inShop, withScope } from "./_base";

/**
 * Member-QR scan awards (P2-02, PRODUCT §5). Everything runs as the shop's team (moz_app in a ShopScope) inside the
 * award's transaction; 0038's policy and guard are the wall (a scan only for a current member of the session's
 * shop who is not the caller).
 */

/**
 * The CURRENT membership in the scoped shop of the customer with this member ID, or null. Whose card it is comes
 * from `shop_member_by_member_id` (0032: the shop from the session scope; null for another shop's member, a former
 * member or an unknown ID), so the award re-checks membership at award time (P1-14 design check M5).
 */
export async function currentMemberByMemberId(
  scope: ShopScope,
  memberId: MemberId,
  tx: Transaction,
): Promise<{ membershipId: string; userId: string } | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q.execute<{ membership_id: string; user_id: string }>(
        sql`SELECT m.id AS membership_id, m.user_id
              FROM public.shop_member_by_member_id(${memberId}) f
              JOIN memberships m ON m.user_id = f.user_id
             WHERE m.shop_id = ${scope.shopId} AND m.left_at IS NULL
             LIMIT 1`,
      ),
    tx,
  );
  return row ? { membershipId: row.membership_id, userId: row.user_id } : null;
}

/** The membership's open request in the scoped shop (at most one, `point_requests_one_open_uq`), or null. */
export async function openRequestOf(
  scope: ShopScope,
  membershipId: string,
  tx: Transaction,
): Promise<string | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ id: pointRequests.id })
        .from(pointRequests)
        .where(
          inShop(
            pointRequests.shopId,
            scope,
            eq(pointRequests.membershipId, membershipId),
            inArray(pointRequests.status, ["pending", "awaiting_owner"]),
          ),
        )
        .limit(1),
    tx,
  );
  return row?.id ?? null;
}

/** The scoped shop's scan already recorded under this client key (a double tap or a retry), or null. */
export async function scanByKey(
  scope: ShopScope,
  idempotencyKey: string,
  tx: Transaction,
): Promise<string | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ id: pointRequests.id })
        .from(pointRequests)
        .where(
          inShop(
            pointRequests.shopId,
            scope,
            and(eq(pointRequests.idempotencyKey, idempotencyKey), eq(pointRequests.source, "scan")),
          ),
        )
        .limit(1),
    tx,
  );
  return row?.id ?? null;
}

/**
 * Inserts the scan's request (pending; the caller decides it in the same transaction). Null when the key is
 * already taken: a concurrent retry with the same key waits for the first to commit, then finds it (`scanByKey`).
 */
export async function insertScanRequest(
  scope: ShopScope,
  input: { membershipId: string; userId: string; idempotencyKey: string },
  tx: Transaction,
): Promise<string | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .insert(pointRequests)
        .values({
          membershipId: input.membershipId,
          userId: input.userId,
          shopId: scope.shopId,
          idempotencyKey: input.idempotencyKey,
          source: "scan",
        })
        .onConflictDoNothing({ target: pointRequests.idempotencyKey })
        .returning({ id: pointRequests.id }),
    tx,
  );
  return row?.id ?? null;
}
