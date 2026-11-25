import "server-only";
/**
 * Approved visits for tests and the test-only seeding API (P1-12): a real point request approved through the
 * approvals service by the shop's owner, so the ledger, membership counters, rewards and receipt are exactly
 * what production writes (never hand-built rows that could drift from the service).
 */
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/id";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests, shopStaff } from "@/server/db/schema";
import { transaction } from "@/server/repos/_base";
import { type ApproveResult, approveRequest } from "@/server/services/approvals";
import { makeStaff, makeUser } from "./factories";

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
  opts: { amountPence?: number; items?: string[]; agoMs?: number } = {},
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
  return result;
}
