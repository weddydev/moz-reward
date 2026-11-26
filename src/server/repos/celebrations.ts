import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { type UnseenApproval, pickCelebration } from "@/lib/celebration";
import type { CustomerScope } from "@/server/authz/scope";
import {
  ledgerEntries,
  memberships,
  pointRequests,
  type ReceiptData,
  receipts,
  rewards,
} from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";

/** Most approvals one claim marks seen (a member returning after a long gap; the rest wait for the next open). */
export const CLAIM_LIMIT = 50;

export type ClaimedApproval = UnseenApproval & {
  shopId: string;
  gold: number;
  amountPence: number | null;
  progressBefore: number | null;
  progressAfter: number | null;
  ingotSize: number | null;
};

export type ClaimedCelebration = {
  approval: ClaimedApproval & { progressBefore: number; progressAfter: number; ingotSize: number };
  receipt: { id: string; number: number; data: ReceiptData } | null;
  rewards: { id: string; label: string; kind: "main" | "milestone" }[];
};

/**
 * P1-15: claims the signed-in customer's unseen approvals and returns the one to celebrate, or null. One scoped
 * transaction: every unseen approval of theirs is marked seen (`seen_at = now()`, RLS `point_requests_own_seen`
 * + the guard allow exactly that), so a second tab, a reload or a retry claims nothing and never plays it again.
 * The newest one with an ingot snapshot, inside the window, at a shop they still belong to and not since
 * reversed, is celebrated; with it its receipt and the rewards it unlocked (own-read policies are the second wall).
 */
export async function claimOwnCelebration(
  scope: CustomerScope,
  now: Date,
): Promise<ClaimedCelebration | null> {
  return withScope(scope, async (q) => {
    const claimed: ClaimedApproval[] = (
      await q
        .update(pointRequests)
        .set({ seenAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            ownedBy(pointRequests.userId, scope),
            eq(pointRequests.status, "approved"),
            isNull(pointRequests.seenAt),
            sql`${pointRequests.id} IN (SELECT id FROM point_requests WHERE user_id = ${scope.userId}
              AND status = 'approved' AND seen_at IS NULL ORDER BY decided_at DESC LIMIT ${CLAIM_LIMIT})`,
          ),
        )
        .returning({
          id: pointRequests.id,
          shopId: pointRequests.shopId,
          decidedAt: pointRequests.decidedAt,
          gold: pointRequests.awardGold,
          amountPence: pointRequests.amountPence,
          progressBefore: pointRequests.progressBefore,
          progressAfter: pointRequests.progressAfter,
          ingotSize: pointRequests.ingotSize,
        })
    ).flatMap((r) =>
      r.decidedAt && r.gold !== null
        ? [{ ...r, decidedAt: r.decidedAt, gold: r.gold, hasSnapshot: r.ingotSize !== null }]
        : [],
    );

    // Newest first among the still-eligible: a left shop or a reversed award is claimed but not celebrated.
    const pool = [...claimed];
    for (;;) {
      const pick = pickCelebration(pool, now);
      if (!pick) return null;
      pool.splice(pool.indexOf(pick), 1);
      const { progressBefore, progressAfter, ingotSize } = pick;
      if (progressBefore === null || progressAfter === null || ingotSize === null) continue;

      const [current] = await q
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            ownedBy(memberships.userId, scope),
            eq(memberships.shopId, pick.shopId),
            isNull(memberships.leftAt),
          ),
        )
        .limit(1);
      if (!current) continue;

      const [reversed] = await q
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.requestId, pick.id), eq(ledgerEntries.type, "reversal")))
        .limit(1);
      if (reversed) continue;

      const [receipt] = await q
        .select({ id: receipts.id, number: receipts.number, data: receipts.data })
        .from(receipts)
        .where(and(eq(receipts.requestId, pick.id), eq(receipts.membershipId, current.id)))
        .limit(1);
      const unlocked = await q
        .select({ id: rewards.id, label: rewards.label, kind: rewards.kind })
        .from(rewards)
        .where(and(eq(rewards.requestId, pick.id), eq(rewards.membershipId, current.id)))
        .orderBy(
          asc(rewards.ingotNumber),
          sql`${rewards.kind} = 'main'`,
          asc(rewards.milestonePercent),
        );
      return {
        approval: { ...pick, progressBefore, progressAfter, ingotSize },
        receipt: receipt ?? null,
        rewards: unlocked.flatMap((r) =>
          r.kind === "main" || r.kind === "milestone" ? [{ ...r, kind: r.kind }] : [],
        ),
      };
    }
  });
}
