import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { CustomerScope } from "@/server/authz/scope";
import { memberships, type ReceiptData, receipts } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";

/** Receipts the shop page lists (PRODUCT §4 "recent receipts"; the full list is on Me, P3). */
export const RECENT_RECEIPTS = 5;

export type OwnReceipt = {
  id: string;
  number: number;
  createdAt: Date;
  data: ReceiptData;
};

/**
 * The customer's latest receipts at one shop (P1-12, C-69), newest first: their own membership's receipts only
 * (the join names the caller's membership; RLS `receipts_own_read` is the second wall). One statement.
 */
export async function readOwnReceipts(
  scope: CustomerScope,
  shopId: string,
  limit: number = RECENT_RECEIPTS,
): Promise<OwnReceipt[]> {
  return withScope(scope, (q) =>
    q
      .select({
        id: receipts.id,
        number: receipts.number,
        createdAt: receipts.createdAt,
        data: receipts.data,
      })
      .from(receipts)
      .innerJoin(memberships, eq(memberships.id, receipts.membershipId))
      .where(and(ownedBy(memberships.userId, scope), eq(receipts.shopId, shopId)))
      .orderBy(desc(receipts.createdAt), desc(receipts.number))
      .limit(limit),
  );
}
