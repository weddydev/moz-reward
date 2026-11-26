import "server-only";
/**
 * Approved visits for tests and the test-only seeding API (P1-12): a real point request approved through the
 * approvals service by the shop's owner, so the ledger, membership counters, rewards and receipt are exactly
 * what production writes (never hand-built rows that could drift from the service).
 */
import { and, eq, isNull } from "drizzle-orm";
import { newId } from "@/lib/id";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, pointRequests, receipts, shopStaff } from "@/server/db/schema";
import { privateStorage } from "@/server/integrations/storage";
import { transaction } from "@/server/repos/_base";
import { receiptPdfKey } from "@/server/repos/receipts";
import { type ApproveResult, approveRequest } from "@/server/services/approvals";
import { makeStaff, makeUser } from "./factories";

/** P1-15 (test API `approve-visit`): the user's current membership of the shop, or null. */
export async function currentMembership(
  shopId: string,
  userId: string,
): Promise<typeof memberships.$inferSelect | null> {
  const [row] = await db()
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.shopId, shopId),
        eq(memberships.userId, userId),
        isNull(memberships.leftAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The shop's owner as an approver (the first owner on the team, or a new one). */
async function ownerOf(shopId: string) {
  const [row] = await db()
    .select({ userId: shopStaff.userId })
    .from(shopStaff)
    .where(and(eq(shopStaff.shopId, shopId), eq(shopStaff.role, "owner")))
    .limit(1);
  const userId = row?.userId ?? (await makeStaff(shopId, (await makeUser()).id, "owner")).userId;
  return mintShopScope({ userId, shopId, role: "owner" });
}

/**
 * One approved visit of `member` at its shop: a pending request made `agoMs` before now (default 1 minute; it
 * must be inside the 24 h window), approved by the owner with the given amount and items.
 */
export async function approvedVisit(
  member: { id: string; userId: string; shopId: string },
  opts: { amountPence?: number; items?: string[]; agoMs?: number; seen?: boolean } = {},
): Promise<Extract<ApproveResult, { outcome: "approved" }>> {
  const scope = await ownerOf(member.shopId);
  const [request] = await db()
    .insert(pointRequests)
    .values({
      membershipId: member.id,
      userId: member.userId,
      shopId: member.shopId,
      idempotencyKey: newId(),
      requestedAt: new Date(Date.now() - (opts.agoMs ?? 60_000)),
    })
    .returning({ id: pointRequests.id });
  if (!request) throw new Error("approvedVisit: no request");
  const result = await transaction(scope, (tx) =>
    approveRequest(
      scope,
      { requestId: request.id, amountPence: opts.amountPence ?? null, items: opts.items ?? null },
      tx,
    ),
  );
  if (result.outcome !== "approved") throw new Error(`approvedVisit: ${result.outcome}`);
  // P1-15: a seeded history visit is already celebrated (`seen`), so no moment opens over the page under test.
  if (opts.seen)
    await db()
      .update(pointRequests)
      .set({ seenAt: new Date() })
      .where(eq(pointRequests.id, request.id));
  return result;
}

/** What the E2E download stores per receipt (the E2E server runs no worker; real rendering is integration-tested). */
export const STUB_RECEIPT_PDF = Buffer.from(
  "%PDF-1.7\n% Moz Rewards E2E stub receipt\n%%EOF\n",
  "latin1",
);

/**
 * P1-12: the worker's `pdf:receipt` result for every receipt of a shop, for E2E: a stub file in the private
 * bucket at the receipt's key, and the key recorded on the row. Returns how many receipts got one.
 */
export async function storeStubReceiptPdfs(shopId: string): Promise<number> {
  const rows = await db()
    .select({ id: receipts.id, shopId: receipts.shopId })
    .from(receipts)
    .where(eq(receipts.shopId, shopId));
  for (const row of rows) {
    const key = receiptPdfKey(row);
    await privateStorage.put(key, STUB_RECEIPT_PDF, "application/pdf");
    await db().update(receipts).set({ pdfKey: key }).where(eq(receipts.id, row.id));
  }
  return rows.length;
}
