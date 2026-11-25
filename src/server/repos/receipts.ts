import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { CustomerScope, ShopScope, SystemScope, TenantScope } from "@/server/authz/scope";
import { memberships, type ReceiptData, receipts } from "@/server/db/schema";
import { inShop, ownedBy, poolFor, withScope } from "./_base";

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

/** A receipt as the PDF job and the download routes see it. `data` is checked before use (jsonb). */
export type ReceiptFile = {
  id: string;
  shopId: string;
  number: number;
  data: unknown;
  pdfKey: string | null;
};

const fileColumns = {
  id: receipts.id,
  shopId: receipts.shopId,
  number: receipts.number,
  data: receipts.data,
  pdfKey: receipts.pdfKey,
};

/** One of the customer's own receipts (any of their memberships, left ones too), or null. */
export async function readOwnReceiptFile(
  scope: CustomerScope,
  receiptId: string,
): Promise<ReceiptFile | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select(fileColumns)
      .from(receipts)
      .innerJoin(memberships, eq(memberships.id, receipts.membershipId))
      .where(and(eq(receipts.id, receiptId), ownedBy(memberships.userId, scope)))
      .limit(1),
  );
  return row ?? null;
}

/** One of the shop's receipts for its team, or null. */
export async function readTeamReceiptFile(
  scope: ShopScope,
  receiptId: string,
): Promise<ReceiptFile | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select(fileColumns)
      .from(receipts)
      .where(inShop(receipts.shopId, scope, eq(receipts.id, receiptId)))
      .limit(1),
  );
  return row ?? null;
}

/** The receipt a tenant job may render: the producing scope's own (customer) or its shop's (team); admins none. */
export function readReceiptFileFor(
  scope: TenantScope,
  receiptId: string,
): Promise<ReceiptFile | null> {
  if (scope.kind === "customer") return readOwnReceiptFile(scope, receiptId);
  if (scope.kind === "shop") return readTeamReceiptFile(scope, receiptId);
  return Promise.resolve(null);
}

/**
 * Records the stored PDF's key (worker only: moz_worker's one write on receipts is UPDATE(pdf_key)). Takes the
 * row a tenant scope has already read, never raw ids from a payload, and touches at most that one row: same id
 * and shop, and only while the key is unset or already this key (a retry). Returns whether the row matched.
 */
export async function recordReceiptPdfKey(
  scope: SystemScope,
  row: Pick<ReceiptFile, "id" | "shopId">,
  key: string,
): Promise<boolean> {
  const updated = await poolFor(scope)
    .update(receipts)
    .set({ pdfKey: key })
    .where(
      and(
        eq(receipts.id, row.id),
        eq(receipts.shopId, row.shopId),
        or(isNull(receipts.pdfKey), eq(receipts.pdfKey, key)),
      ),
    )
    .returning({ id: receipts.id });
  if (updated.length > 1) throw new Error("recordReceiptPdfKey: more than one row matched");
  return updated.length === 1;
}

/** The one place a receipt PDF lives in the private bucket, built from the row (never from a payload). */
export const receiptPdfKey = (row: Pick<ReceiptFile, "id" | "shopId">): string =>
  `receipts/${row.shopId}/${row.id}.pdf`;
