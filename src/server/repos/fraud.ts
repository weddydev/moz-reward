import "server-only";
import { eq } from "drizzle-orm";
import type { ShopScope, SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { fraudFlags, memberships, pointRequests, receipts } from "@/server/db/schema";
import { inShop, withScope } from "./_base";

/** Who took part in one approved award, as its shop's team sees it (RLS on all three tables). */
export type AwardParties = {
  receiptId: string;
  shopId: string;
  requestId: string;
  membershipId: string;
  customerId: string;
  approverId: string;
  /** The staff member whose over-limit approval sent it to the owner (null when it wasn't routed). */
  routerId: string | null;
};

/**
 * The parties of an award for the fraud rules (P1-12): the receipt, its request and its membership, joined
 * under the team's scope, with the approver and, for an award routed to the owner, the staff member who routed
 * it (the rules check both). The receipt must belong to `requestId` and the request must be approved with a
 * recorded approver; anything else (another shop's receipt, a deactivated team member, a payload naming another
 * request) reads as null.
 */
export async function readAwardParties(
  scope: ShopScope,
  ids: { receiptId: string; requestId: string },
): Promise<AwardParties | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({
        receiptId: receipts.id,
        shopId: receipts.shopId,
        requestId: pointRequests.id,
        membershipId: memberships.id,
        customerId: memberships.userId,
        approverId: pointRequests.decidedBy,
        routerId: pointRequests.routedBy,
      })
      .from(receipts)
      .innerJoin(pointRequests, eq(pointRequests.id, receipts.requestId))
      .innerJoin(memberships, eq(memberships.id, receipts.membershipId))
      .where(
        inShop(
          receipts.shopId,
          scope,
          eq(receipts.id, ids.receiptId),
          eq(pointRequests.id, ids.requestId),
          eq(pointRequests.shopId, scope.shopId),
          eq(pointRequests.status, "approved"),
        ),
      )
      .limit(1),
  );
  if (!row?.approverId) return null;
  return { ...row, approverId: row.approverId };
}

export type NewFraudFlag = {
  rule: string;
  entity: "receipt";
  entityId: string;
  /** Ids and counts only (ARCHITECTURE §4: no personal data in a flag). */
  details: Record<string, string | number>;
};

/**
 * Records a rule hit for the fraud monitor (worker only: moz_app can't write fraud_flags, migration 0029).
 * One flag per rule and entity: a retry or a second run finds the existing row. Returns whether it is new.
 */
export async function recordFraudFlag(
  scope: SystemScope,
  flag: NewFraudFlag,
  tx: Transaction,
): Promise<boolean> {
  const inserted = await withScope(
    scope,
    (q) =>
      q
        .insert(fraudFlags)
        .values(flag)
        .onConflictDoNothing({
          target: [fraudFlags.rule, fraudFlags.entity, fraudFlags.entityId],
        })
        .returning({ id: fraudFlags.id }),
    tx,
  );
  return inserted.length === 1;
}
