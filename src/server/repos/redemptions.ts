import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { ShopStatus } from "@/lib/loyalty/redeem";
import type { CustomerScope, ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { ledgerEntries, memberships, redemptionCodes, rewards, shops } from "@/server/db/schema";
import { inShop, ownedBy, withScope } from "./_base";

/**
 * Rewards and redeem codes (P1-16). The database is the wall (0034: redemption_codes guard, rewards guard,
 * ledger guard, RLS); these statements are the only way the app touches them.
 */

export type ReadyReward = {
  id: string;
  shopId: string;
  shopName: string;
  label: string;
  kind: "main" | "milestone" | "game" | "other";
  isMystery: boolean;
  unlockedAt: Date;
  expiresAt: Date;
};

/**
 * The caller's unredeemed, unexpired rewards at their current shops (optionally one shop), soonest expiry first.
 * Left shops' rewards are hidden and reappear on rejoin, each with its own validity (C-70).
 */
export async function readOwnReadyRewards(
  scope: CustomerScope,
  opts: { shopId?: string; now: Date },
  tx?: Transaction,
): Promise<ReadyReward[]> {
  return withScope(
    scope,
    (q) =>
      q
        .select({
          id: rewards.id,
          shopId: rewards.shopId,
          shopName: shops.name,
          label: rewards.label,
          kind: rewards.kind,
          isMystery: rewards.isMystery,
          unlockedAt: rewards.unlockedAt,
          expiresAt: rewards.expiresAt,
        })
        .from(rewards)
        .innerJoin(memberships, eq(memberships.id, rewards.membershipId))
        .innerJoin(shops, eq(shops.id, rewards.shopId))
        .where(
          ownedBy(
            memberships.userId,
            scope,
            isNull(memberships.leftAt),
            isNull(rewards.redeemedAt),
            gt(rewards.expiresAt, opts.now),
            opts.shopId ? eq(rewards.shopId, opts.shopId) : undefined,
          ),
        )
        .orderBy(asc(rewards.expiresAt), asc(rewards.id))
        .limit(100),
    tx,
  );
}

export type OwnReward = {
  id: string;
  membershipId: string;
  shopId: string;
  shopName: string;
  shopStatus: ShopStatus;
  shopClosedAt: Date | null;
  label: string;
  expiresAt: Date;
  redeemedAt: Date | null;
  leftAt: Date | null;
};

/** One of the caller's rewards with its shop's state (null: not theirs or doesn't exist). */
export async function readOwnReward(
  scope: CustomerScope,
  rewardId: string,
  tx: Transaction,
): Promise<OwnReward | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: rewards.id,
          membershipId: rewards.membershipId,
          shopId: rewards.shopId,
          shopName: shops.name,
          shopStatus: shops.status,
          shopClosedAt: shops.closedAt,
          label: rewards.label,
          expiresAt: rewards.expiresAt,
          redeemedAt: rewards.redeemedAt,
          leftAt: memberships.leftAt,
        })
        .from(rewards)
        .innerJoin(memberships, eq(memberships.id, rewards.membershipId))
        .innerJoin(shops, eq(shops.id, rewards.shopId))
        .where(ownedBy(memberships.userId, scope, eq(rewards.id, rewardId)))
        .limit(1),
    tx,
  );
  return row ?? null;
}

/** Voids the member's live code at that membership (at most one, by index). Returns the voided ids. */
export async function voidOwnLiveCodes(
  scope: CustomerScope,
  membershipIds: readonly string[],
  reason: "regenerated" | "left",
  tx: Transaction,
): Promise<string[]> {
  if (membershipIds.length === 0) return [];
  const rows = await withScope(
    scope,
    (q) =>
      q
        .update(redemptionCodes)
        .set({ status: "voided", voidedAt: sql`now()`, voidReason: reason })
        .where(
          and(
            inArray(redemptionCodes.membershipId, [...membershipIds]),
            eq(redemptionCodes.status, "live"),
          ),
        )
        .returning({ id: redemptionCodes.id }),
    tx,
  );
  return rows.map((r) => r.id);
}

/** The caller's memberships at a shop, current or left (a leave voids codes of the current one). */
export async function ownMembershipIdsAt(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<string[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({ id: memberships.id })
        .from(memberships)
        .where(ownedBy(memberships.userId, scope, eq(memberships.shopId, shopId))),
    tx,
  );
  return rows.map((r) => r.id);
}

/**
 * Inserts a live code (15 minutes from the transaction's start, as the guard insists) inside a savepoint, so a
 * clash on the live (shop, hash) index can be retried with a new code without losing the caller's transaction.
 */
export async function insertOwnCode(
  scope: CustomerScope,
  row: { shopId: string; membershipId: string; rewardId: string; codeHash: string },
  tx: Transaction,
): Promise<{ id: string; expiresAt: Date; serverNow: Date }> {
  return withScope(
    scope,
    (q) =>
      q.transaction(async (sp) => {
        const [out] = await sp
          .insert(redemptionCodes)
          .values({ ...row, expiresAt: sql`now() + interval '15 minutes'` })
          .returning({
            id: redemptionCodes.id,
            expiresAt: redemptionCodes.expiresAt,
            serverNow: sql<Date>`clock_timestamp()`.mapWith(redemptionCodes.createdAt),
          });
        if (!out) throw new Error("insertOwnCode: no row returned");
        return out;
      }),
    tx,
  );
}

/** Live, unexpired codes in the shop now (the guessing guard's weight). */
export async function countLiveCodes(scope: ShopScope): Promise<number> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(redemptionCodes)
      .where(
        inShop(
          redemptionCodes.shopId,
          scope,
          eq(redemptionCodes.status, "live"),
          gt(redemptionCodes.expiresAt, sql`now()`),
        ),
      ),
  );
  return row?.n ?? 0;
}

export type LockedCode = {
  id: string;
  status: "live" | "voided" | "confirmed";
  /** Why a voided code was voided ("regenerated": a newer code exists; "left": the member left the shop). */
  voidReason: string | null;
  expiresAt: Date;
  rewardId: string;
  membershipId: string;
  /** clock_timestamp() after the lock was taken. */
  checkedAt: Date;
};

/**
 * The newest code in this shop with this hash made in the last 24 hours, any status, locked. A parallel confirm
 * waits here and then sees `confirmed` ("Already redeemed"), and a code a few minutes past its 15 reads
 * "expired", never "not recognised" (design check M4). Matching a dead code gains a guesser nothing.
 */
export async function lockCodeByHash(
  scope: ShopScope,
  codeHash: string,
  tx: Transaction,
): Promise<LockedCode | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: redemptionCodes.id,
          status: redemptionCodes.status,
          expiresAt: redemptionCodes.expiresAt,
          rewardId: redemptionCodes.rewardId,
          membershipId: redemptionCodes.membershipId,
        })
        .from(redemptionCodes)
        .where(
          inShop(
            redemptionCodes.shopId,
            scope,
            eq(redemptionCodes.codeHash, codeHash),
            gt(redemptionCodes.createdAt, sql`now() - interval '24 hours'`),
          ),
        )
        .orderBy(desc(redemptionCodes.createdAt))
        .limit(1)
        .for("update"),
    tx,
  );
  if (!row) return null;
  // The status may have changed while we waited for the lock: read the row's current state again.
  const [fresh] = await withScope(
    scope,
    (q) =>
      q
        .select({
          status: redemptionCodes.status,
          voidReason: redemptionCodes.voidReason,
          checkedAt: sql<Date>`clock_timestamp()`.mapWith(redemptionCodes.createdAt),
        })
        .from(redemptionCodes)
        .where(inShop(redemptionCodes.shopId, scope, eq(redemptionCodes.id, row.id))),
    tx,
  );
  if (!fresh) return null;
  return { ...row, status: fresh.status, voidReason: fresh.voidReason, checkedAt: fresh.checkedAt };
}

export type ConfirmTarget = {
  label: string;
  kind: "main" | "milestone" | "game" | "other";
  expiresAt: Date;
  redeemedAt: Date | null;
  userId: string;
  leftAt: Date | null;
  shopStatus: ShopStatus;
  shopClosedAt: Date | null;
};

/** The reward behind a code, with its member's account and the shop's state (team read, own shop). */
export async function readConfirmTarget(
  scope: ShopScope,
  code: { rewardId: string; membershipId: string },
  tx: Transaction,
): Promise<ConfirmTarget | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          label: rewards.label,
          kind: rewards.kind,
          expiresAt: rewards.expiresAt,
          redeemedAt: rewards.redeemedAt,
          userId: memberships.userId,
          leftAt: memberships.leftAt,
          shopStatus: shops.status,
          shopClosedAt: shops.closedAt,
        })
        .from(rewards)
        .innerJoin(memberships, eq(memberships.id, rewards.membershipId))
        .innerJoin(shops, eq(shops.id, rewards.shopId))
        .where(
          inShop(
            rewards.shopId,
            scope,
            eq(rewards.id, code.rewardId),
            eq(rewards.membershipId, code.membershipId),
          ),
        )
        .limit(1),
    tx,
  );
  return row ?? null;
}

/**
 * The confirm (one transaction, in this order, as the guards require): the code → confirmed, the reward's
 * redeemed_at, then the 0-gold `redeem` ledger row naming both.
 */
export async function confirmCode(
  scope: ShopScope,
  code: { id: string; rewardId: string; membershipId: string },
  tx: Transaction,
): Promise<void> {
  await withScope(
    scope,
    async (q) => {
      await q
        .update(redemptionCodes)
        .set({ status: "confirmed", confirmedBy: scope.userId, confirmedAt: sql`now()` })
        .where(inShop(redemptionCodes.shopId, scope, eq(redemptionCodes.id, code.id)));
      await q
        .update(rewards)
        .set({ redeemedAt: sql`now()` })
        .where(inShop(rewards.shopId, scope, eq(rewards.id, code.rewardId)));
      await q.insert(ledgerEntries).values({
        membershipId: code.membershipId,
        shopId: scope.shopId,
        type: "redeem",
        points: 0,
        idempotencyKey: `${code.id}:redeem`,
        ref: { rewardId: code.rewardId, redemptionId: code.id },
        createdBy: scope.userId,
      });
    },
    tx,
  );
}

/** The status of one of the caller's codes (null: not theirs). */
export async function readOwnCodeStatus(
  scope: CustomerScope,
  codeId: string,
): Promise<"live" | "voided" | "confirmed" | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ status: redemptionCodes.status })
      .from(redemptionCodes)
      .innerJoin(memberships, eq(memberships.id, redemptionCodes.membershipId))
      .where(ownedBy(memberships.userId, scope, eq(redemptionCodes.id, codeId)))
      .limit(1),
  );
  return row?.status ?? null;
}
