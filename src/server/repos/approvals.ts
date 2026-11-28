import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { MilestonePercent } from "@/lib/loyalty/programme";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import {
  ledgerEntries,
  memberships,
  pointRequests,
  type PointRequestStatus,
  type ReceiptData,
  receipts,
  type RejectReason,
  rewards,
  shopReceiptCounters,
  shops,
  shopStaff,
  users,
} from "@/server/db/schema";
import { inShop, transaction, withScope } from "./_base";

/**
 * Approvals, rejections and reversals (P1-12, PRODUCT §5, §11). Everything runs as the shop's team (moz_app in a
 * ShopScope) and in the order 0029's guards check: the request is decided before its ledger rows, the ledger rows
 * exist before the membership and rewards change, the counter moves before its receipt. Row locks follow the
 * team's UPDATE policies: the membership, then the request (as `leaveShop` does), so a leave, a cancel and a
 * decision on one member are serialised; receipts and the staff row are read with plain SELECTs (no UPDATE grant,
 * so no lock).
 */

/** The database's clock for this transaction (`now()` is fixed per transaction; the guards compare with it). */
export async function transactionNow(scope: ShopScope, tx: Transaction): Promise<Date> {
  const rows = await withScope(
    scope,
    (q) => q.execute<{ now: Date | string }>(sql`SELECT now() AS now`),
    tx,
  );
  const value = rows[0]?.now;
  if (value === undefined) throw new Error("transactionNow: no row");
  return value instanceof Date ? value : new Date(value);
}

export type TeamRequest = {
  id: string;
  membershipId: string;
  userId: string;
  status: PointRequestStatus;
  requestedAt: Date;
  amountPence: number | null;
  items: string[] | null;
  awardGold: number | null;
};

const teamRequestColumns = {
  id: pointRequests.id,
  membershipId: pointRequests.membershipId,
  userId: pointRequests.userId,
  status: pointRequests.status,
  requestedAt: pointRequests.requestedAt,
  amountPence: pointRequests.amountPence,
  items: pointRequests.items,
  awardGold: pointRequests.awardGold,
};

/** A request of the scoped shop (plain read: which membership to lock first), or null. */
export async function findTeamRequest(
  scope: ShopScope,
  requestId: string,
  tx: Transaction,
): Promise<TeamRequest | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select(teamRequestColumns)
        .from(pointRequests)
        .where(inShop(pointRequests.shopId, scope, eq(pointRequests.id, requestId)))
        .limit(1),
    tx,
  );
  return row ?? null;
}

/** The same request under a row lock (after its membership's lock), re-read so its status is current. */
export async function lockTeamRequest(
  scope: ShopScope,
  requestId: string,
  tx: Transaction,
): Promise<TeamRequest | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select(teamRequestColumns)
        .from(pointRequests)
        .where(inShop(pointRequests.shopId, scope, eq(pointRequests.id, requestId)))
        .limit(1)
        .for("update"),
    tx,
  );
  return row ?? null;
}

export type TeamMembership = {
  id: string;
  userId: string;
  joinedAt: Date;
  leftAt: Date | null;
  purchaseCount: number;
  lastVisitAt: Date | null;
  progressGold: number;
  ingotsCompleted: number;
  ingotStartedAt: Date | null;
  milestonesReached: MilestonePercent[];
  goldShortfall: number;
  tier: (typeof memberships.$inferSelect)["tier"];
  streakWeeks: number;
  streakLastWeekStart: string | null;
};

/** Locks a membership of the scoped shop (FOR UPDATE) and returns its loyalty state, or null. */
export async function lockTeamMembership(
  scope: ShopScope,
  membershipId: string,
  tx: Transaction,
): Promise<TeamMembership | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: memberships.id,
          userId: memberships.userId,
          joinedAt: memberships.joinedAt,
          leftAt: memberships.leftAt,
          purchaseCount: memberships.purchaseCount,
          lastVisitAt: memberships.lastVisitAt,
          progressGold: memberships.progressGold,
          ingotsCompleted: memberships.ingotsCompleted,
          ingotStartedAt: memberships.ingotStartedAt,
          milestonesReached: memberships.milestonesReached,
          goldShortfall: memberships.goldShortfall,
          tier: memberships.tier,
          streakWeeks: memberships.streakWeeks,
          streakLastWeekStart: memberships.streakLastWeekStart,
        })
        .from(memberships)
        .where(inShop(memberships.shopId, scope, eq(memberships.id, membershipId)))
        .limit(1)
        .for("update"),
    tx,
  );
  if (!row) return null;
  return { ...row, milestonesReached: row.milestonesReached as MilestonePercent[] };
}

export type OwnStaffRow = {
  role: (typeof shopStaff.$inferSelect)["role"];
  perAwardLimit: number | null;
  active: boolean;
};

/** The caller's own staff row in the scoped shop, read live (deactivated or limit changed mid-session). */
export async function readOwnStaffRow(
  scope: ShopScope,
  tx: Transaction,
): Promise<OwnStaffRow | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          role: shopStaff.role,
          perAwardLimit: shopStaff.perAwardLimit,
          active: shopStaff.active,
        })
        .from(shopStaff)
        .where(inShop(shopStaff.shopId, scope, eq(shopStaff.userId, scope.userId)))
        .limit(1),
    tx,
  );
  return row ?? null;
}

/** The caller's own display name (users_own policy), for the receipt's staff initials. */
export async function readOwnName(scope: ShopScope, tx: Transaction): Promise<string> {
  const [row] = await withScope(
    scope,
    (q) => q.select({ name: users.name }).from(users).where(eq(users.id, scope.userId)).limit(1),
    tx,
  );
  return row?.name ?? "";
}

/** The platform cap per award, by the database's own rule (`award_cap()`: invalid or missing = default). */
export async function readAwardCap(
  scope: ShopScope,
  tx: Transaction,
): Promise<{ pence: number; gold: number }> {
  const rows = await withScope(
    scope,
    (q) => q.execute<{ pence: number; gold: number }>(sql`SELECT pence, gold FROM award_cap()`),
    tx,
  );
  const row = rows[0];
  if (!row) throw new Error("readAwardCap: no row");
  return { pence: row.pence, gold: row.gold };
}

/** What the receipt snapshot needs about the shop (no customer data). */
export async function readReceiptShop(
  scope: ShopScope,
  tx: Transaction,
): Promise<{ name: string; address: string | null; vatNumber: string | null }> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          name: shops.name,
          tradingName: shops.tradingName,
          addressLine1: shops.addressLine1,
          addressLine2: shops.addressLine2,
          town: shops.town,
          postcode: shops.postcode,
          vatNumber: shops.vatNumber,
        })
        .from(shops)
        .where(inShop(shops.id, scope))
        .limit(1),
    tx,
  );
  if (!row) throw new Error("readReceiptShop: shop not visible to its own team");
  const address = [row.addressLine1, row.addressLine2, row.town, row.postcode]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
  const vat = row.vatNumber?.trim();
  return {
    name: row.tradingName?.trim() || row.name,
    address: address || null,
    vatNumber: vat ? vat : null,
  };
}

/** The shop's active owners (to tell them about an award waiting for them), at most 100. */
export async function activeOwnerIds(scope: ShopScope, tx: Transaction): Promise<string[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({ userId: shopStaff.userId })
        .from(shopStaff)
        .where(
          inShop(shopStaff.shopId, scope, eq(shopStaff.role, "owner"), eq(shopStaff.active, true)),
        )
        .orderBy(asc(shopStaff.userId))
        .limit(100),
    tx,
  );
  return rows.map((r) => r.userId);
}

type Award = { amountPence: number | null; items: string[] | null; awardGold: number };

/** pending → awaiting_owner: a staff member's over-limit award waits for the owner (same 24 h). */
export async function routeTeamRequest(
  scope: ShopScope,
  requestId: string,
  award: Award,
  tx: Transaction,
): Promise<void> {
  await withScope(
    scope,
    (q) =>
      q
        .update(pointRequests)
        .set({
          status: "awaiting_owner",
          amountPence: award.amountPence,
          items: award.items,
          awardGold: award.awardGold,
          routedBy: scope.userId,
          routedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(inShop(pointRequests.shopId, scope, eq(pointRequests.id, requestId))),
    tx,
  );
}

/** P1-15: the ingot before and after an approval (the customer's celebration pours between them). */
export type IngotSnapshot = { progressBefore: number; progressAfter: number; ingotSize: number };

/** → approved by the caller, now, with the ingot snapshot (P1-15). */
export async function approveTeamRequest(
  scope: ShopScope,
  requestId: string,
  award: Award,
  snapshot: IngotSnapshot,
  tx: Transaction,
): Promise<void> {
  await withScope(
    scope,
    (q) =>
      q
        .update(pointRequests)
        .set({
          status: "approved",
          amountPence: award.amountPence,
          items: award.items,
          awardGold: award.awardGold,
          decidedBy: scope.userId,
          decidedAt: sql`now()`,
          progressBefore: snapshot.progressBefore,
          progressAfter: snapshot.progressAfter,
          ingotSize: snapshot.ingotSize,
          updatedAt: sql`now()`,
        })
        .where(inShop(pointRequests.shopId, scope, eq(pointRequests.id, requestId))),
    tx,
  );
}

/** → rejected by the caller, now, with a preset reason and optional note (shop-only). */
export async function rejectTeamRequest(
  scope: ShopScope,
  requestId: string,
  reason: { code: RejectReason; note: string | null },
  tx: Transaction,
): Promise<void> {
  await withScope(
    scope,
    (q) =>
      q
        .update(pointRequests)
        .set({
          status: "rejected",
          rejectReason: reason.code,
          rejectNote: reason.note,
          decidedBy: scope.userId,
          decidedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(inShop(pointRequests.shopId, scope, eq(pointRequests.id, requestId))),
    tx,
  );
}

export type LedgerRow = {
  membershipId: string;
  type: "earn" | "bonus_streak" | "reversal";
  points: number;
  programVersion: number | null;
  requestId: string;
  receiptId: string;
  idempotencyKey: string;
  ref: Record<string, string | number | boolean>;
};

/** Appends ledger rows written by the caller (the database stamps `created_at` and `tx_id`). */
export async function insertLedgerRows(
  scope: ShopScope,
  rows: readonly LedgerRow[],
  tx: Transaction,
): Promise<void> {
  if (rows.length === 0) return;
  await withScope(
    scope,
    (q) =>
      q
        .insert(ledgerEntries)
        .values(rows.map((r) => ({ ...r, shopId: scope.shopId, createdBy: scope.userId }))),
    tx,
  );
}

/** Gold the request's approval put on the ledger (earn + streak bonus). */
export async function awardedGold(
  scope: ShopScope,
  requestId: string,
  tx: Transaction,
): Promise<number> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ n: sql<number>`coalesce(sum(${ledgerEntries.points}), 0)::int` })
        .from(ledgerEntries)
        .where(
          inShop(
            ledgerEntries.shopId,
            scope,
            eq(ledgerEntries.requestId, requestId),
            inArray(ledgerEntries.type, ["earn", "bonus_streak"]),
          ),
        ),
    tx,
  );
  return row?.n ?? 0;
}

/** Whether the receipt was already reversed. */
export async function isReversed(
  scope: ShopScope,
  receiptId: string,
  tx: Transaction,
): Promise<boolean> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ id: ledgerEntries.id })
        .from(ledgerEntries)
        .where(
          inShop(
            ledgerEntries.shopId,
            scope,
            eq(ledgerEntries.receiptId, receiptId),
            eq(ledgerEntries.type, "reversal"),
          ),
        )
        .limit(1),
    tx,
  );
  return !!row;
}

export type MembershipLoyaltyUpdate = {
  progressGold: number;
  ingotsCompleted: number;
  ingotStartedAt: Date | null;
  milestonesReached: readonly MilestonePercent[];
  goldShortfall: number;
  tier: TeamMembership["tier"];
  streakWeeks: number;
  streakLastWeekStart: string | null;
  /** An approved visit: purchase count + 1 and the last visit moved on to `visitAt` (never back). */
  visitAt?: Date;
};

/** Writes the engine's new member state (after this transaction's ledger row: the guard checks it). */
export async function updateMembershipLoyalty(
  scope: ShopScope,
  membershipId: string,
  next: MembershipLoyaltyUpdate,
  tx: Transaction,
): Promise<void> {
  const visit = next.visitAt
    ? {
        purchaseCount: sql`${memberships.purchaseCount} + 1`,
        lastVisitAt: sql`greatest(${memberships.lastVisitAt}, ${next.visitAt.toISOString()}::timestamptz)`,
      }
    : {};
  await withScope(
    scope,
    (q) =>
      q
        .update(memberships)
        .set({
          progressGold: next.progressGold,
          ingotsCompleted: next.ingotsCompleted,
          ingotStartedAt: next.ingotStartedAt,
          milestonesReached: [...next.milestonesReached],
          goldShortfall: next.goldShortfall,
          tier: next.tier,
          streakWeeks: next.streakWeeks,
          streakLastWeekStart: next.streakLastWeekStart,
          updatedAt: sql`now()`,
          ...visit,
        })
        .where(inShop(memberships.shopId, scope, eq(memberships.id, membershipId))),
    tx,
  );
}

export type NewReward = {
  membershipId: string;
  kind: "main" | "milestone";
  label: string;
  ingotNumber: number;
  milestonePercent: number | null;
  rewardsVersion: number;
  isMystery: boolean;
  requestId: string;
};

/** Unlocks rewards beside this transaction's earn row; returns their ids in order. */
export async function insertRewards(
  scope: ShopScope,
  rows: readonly NewReward[],
  tx: Transaction,
): Promise<string[]> {
  if (rows.length === 0) return [];
  const out = await withScope(
    scope,
    (q) =>
      q
        .insert(rewards)
        .values(rows.map((r) => ({ ...r, shopId: scope.shopId })))
        .returning({ id: rewards.id }),
    tx,
  );
  return out.map((r) => r.id);
}

/**
 * The shop's next receipt number: creates the counter at 1 or moves it on by one, under its row lock (held to
 * commit, so concurrent approvals in one shop take numbers in turn and a rolled-back one frees its number).
 */
export async function nextReceiptNumber(scope: ShopScope, tx: Transaction): Promise<number> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .insert(shopReceiptCounters)
        .values({ shopId: scope.shopId, lastNumber: 1 })
        .onConflictDoUpdate({
          target: shopReceiptCounters.shopId,
          set: { lastNumber: sql`${shopReceiptCounters.lastNumber} + 1` },
        })
        .returning({ n: shopReceiptCounters.lastNumber }),
    tx,
  );
  if (!row) throw new Error("nextReceiptNumber: no row");
  return row.n;
}

export async function insertReceipt(
  scope: ShopScope,
  input: {
    id: string;
    membershipId: string;
    requestId: string;
    number: number;
    data: ReceiptData;
  },
  tx: Transaction,
): Promise<void> {
  await withScope(
    scope,
    (q) => q.insert(receipts).values({ ...input, shopId: scope.shopId, createdBy: scope.userId }),
    tx,
  );
}

export type TeamReceipt = {
  id: string;
  membershipId: string;
  requestId: string;
  number: number;
  createdBy: string;
  createdAt: Date;
};

/** A receipt of the scoped shop, or null. */
export async function findTeamReceipt(
  scope: ShopScope,
  receiptId: string,
  tx: Transaction,
): Promise<TeamReceipt | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: receipts.id,
          membershipId: receipts.membershipId,
          requestId: receipts.requestId,
          number: receipts.number,
          createdBy: receipts.createdBy,
          createdAt: receipts.createdAt,
        })
        .from(receipts)
        .where(and(inShop(receipts.shopId, scope), eq(receipts.id, receiptId)))
        .limit(1),
    tx,
  );
  return row ?? null;
}

/**
 * What the approve panel's live preview needs (P2-02): the platform cap per award and the caller's own per-award
 * limit (null for owners and for staff without one). A guide only: `approveRequest` reads both again under its
 * locks and decides.
 */
export async function readApproveLimits(
  scope: ShopScope,
): Promise<{ cap: { pence: number; gold: number }; limit: number | null }> {
  return transaction(scope, async (tx) => {
    const cap = await readAwardCap(scope, tx);
    const own = await readOwnStaffRow(scope, tx);
    return { cap, limit: own?.role === "staff" ? own.perAwardLimit : null };
  });
}
