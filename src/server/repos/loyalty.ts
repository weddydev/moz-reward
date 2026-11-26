import "server-only";
import { asc, sql } from "drizzle-orm";
import type { ProgrammeRules, ProgrammeVersion } from "@/lib/loyalty/programme";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { loyaltyPrograms, shops } from "@/server/db/schema";
import { inShop, withScope } from "./_base";

type Row = typeof loyaltyPrograms.$inferSelect;

/** One stored row as a `ProgrammeVersion` (also the Wallet read, P1-07). */
export const toVersion = (r: Row): ProgrammeVersion => ({
  id: r.id,
  version: r.version,
  earnMode: r.earnMode,
  earnRate: r.earnRate,
  ingotSize: r.ingotSize,
  mainReward: { text: r.mainReward.text },
  milestones: r.milestones.map((m) => ({
    percent: m.percent,
    reward: m.reward,
    isMystery: m.isMystery,
  })),
  streak: r.streak ? { bonusGold: r.streak.bonusGold } : null,
  tiers: { silver: r.tiers.silver, gold: r.tiers.gold },
  expiryMonths: r.expiryMonths,
  rewardValidDays: r.rewardValidDays,
  activeFrom: r.activeFrom,
  rewardsFrom: r.rewardsFrom,
  createdAt: r.createdAt,
});

/**
 * Every version of the shop's programme, oldest first (P1-05). A shop has few: saves are owner-only and
 * rate-limited, and the resolution rules need the full list (the version an old ingot started under).
 */
export async function listProgrammeVersions(
  scope: ShopScope,
  tx?: Transaction,
): Promise<ProgrammeVersion[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select()
        .from(loyaltyPrograms)
        .where(inShop(loyaltyPrograms.shopId, scope))
        .orderBy(asc(loyaltyPrograms.version)),
    tx,
  );
  return rows.map(toVersion);
}

/**
 * Serialises programme saves of one shop until the transaction ends, so "read the latest version, compare it
 * with the form's base version, append the next" can't interleave (the unique index is the second wall).
 */
export async function lockProgrammeSaves(scope: ShopScope, tx: Transaction): Promise<void> {
  await withScope(
    scope,
    (q) =>
      q.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`loyalty_programs:${scope.shopId}`}, 0))`,
      ),
    tx,
  );
}

/** Appends a version for the scope's shop, saved by the scope's user (RLS: owner only, as themself). */
export async function insertProgrammeVersion(
  scope: ShopScope,
  tx: Transaction,
  v: { version: number; rules: ProgrammeRules; activeFrom: Date; rewardsFrom: Date },
): Promise<ProgrammeVersion> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .insert(loyaltyPrograms)
        .values({
          shopId: scope.shopId,
          version: v.version,
          earnMode: v.rules.earnMode,
          earnRate: v.rules.earnRate,
          ingotSize: v.rules.ingotSize,
          mainReward: v.rules.mainReward,
          milestones: v.rules.milestones,
          streak: v.rules.streak,
          tiers: v.rules.tiers,
          expiryMonths: v.rules.expiryMonths,
          rewardValidDays: v.rules.rewardValidDays,
          activeFrom: v.activeFrom,
          rewardsFrom: v.rewardsFrom,
          createdBy: scope.userId,
        })
        .returning(),
    tx,
  );
  if (!row) throw new Error("loyalty programme insert returned no row");
  return toVersion(row);
}

/**
 * The shop's code, read in the save's transaction, so the action can drop the shop's cached landing page
 * (its reward preview, C-50) once the new version has committed.
 */
export async function ownShopCode(scope: ShopScope, tx?: Transaction): Promise<string | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q.select({ shopCode: shops.shopCode }).from(shops).where(inShop(shops.id, scope)).limit(1),
    tx,
  );
  return row?.shopCode ?? null;
}
