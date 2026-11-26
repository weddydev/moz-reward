import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { newId } from "@/lib/id";
import type { ExpiryWarningDays, SentExpiryWarning } from "@/lib/loyalty/engine";
import type { MilestonePercent, ProgrammeVersion } from "@/lib/loyalty/programme";
import type { SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import {
  ledgerEntries,
  loyaltyPrograms,
  memberships,
  pointsExpiryWarnings,
  shops,
} from "@/server/db/schema";
import { type Executor, withScope } from "./_base";
import { toVersion } from "./loyalty";

/**
 * P1-13 points expiry (PRODUCT §4, §6): the daily job's reads and writes, all as the system role (a cross-shop
 * sweep, ARCHITECTURE §6). Sweeps page by membership id (keyset), never OFFSET, and lock the page they work on.
 */

/** Shops whose members' gold can expire: the states that run the loyalty programme (PRODUCT §15). */
const RUNNING_SHOP = ["active", "expiring", "grace", "restricted"] as const;

export const FIRST_KEY = "00000000-0000-0000-0000-000000000000";

export type ExpiryCandidate = {
  id: string;
  userId: string;
  shopId: string;
  joinedAt: Date;
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

/**
 * The next page of current memberships (not left) with current-ingot gold at a running shop whose programme has
 * ever had an expiry setting, after `afterId`, locked (FOR UPDATE: an approval on the same member waits, and
 * the job's decision is made on the state it writes back).
 */
export async function lockExpiryCandidates(
  scope: SystemScope,
  tx: Transaction,
  afterId: string,
  limit: number,
): Promise<ExpiryCandidate[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: memberships.id,
          userId: memberships.userId,
          shopId: memberships.shopId,
          joinedAt: memberships.joinedAt,
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
        .innerJoin(shops, eq(shops.id, memberships.shopId))
        .where(
          and(
            gt(memberships.id, afterId),
            isNull(memberships.leftAt),
            gt(memberships.progressGold, 0),
            inArray(shops.status, [...RUNNING_SHOP]),
            sql`EXISTS (SELECT 1 FROM ${loyaltyPrograms} lp
                        WHERE lp.shop_id = ${memberships.shopId} AND lp.expiry_months IS NOT NULL)`,
          ),
        )
        .orderBy(asc(memberships.id))
        .limit(limit)
        .for("update", { of: memberships }),
    tx,
  );
  return rows.map((r) => ({ ...r, milestonesReached: r.milestonesReached as MilestonePercent[] }));
}

/** Every programme version of these shops, oldest first per shop. */
export async function programmeVersionsOf(
  scope: SystemScope,
  tx: Transaction,
  shopIds: readonly string[],
): Promise<Map<string, ProgrammeVersion[]>> {
  const out = new Map<string, ProgrammeVersion[]>();
  if (shopIds.length === 0) return out;
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select()
        .from(loyaltyPrograms)
        .where(inArray(loyaltyPrograms.shopId, [...shopIds]))
        .orderBy(asc(loyaltyPrograms.shopId), asc(loyaltyPrograms.version)),
    tx,
  );
  for (const r of rows) {
    const list = out.get(r.shopId) ?? [];
    list.push(toVersion(r));
    out.set(r.shopId, list);
  }
  return out;
}

/** The warnings already sent to these memberships (every expiry date; the engine keeps the current one's). */
export async function sentWarningsOf(
  scope: SystemScope,
  tx: Transaction,
  membershipIds: readonly string[],
): Promise<Map<string, SentExpiryWarning[]>> {
  const out = new Map<string, SentExpiryWarning[]>();
  if (membershipIds.length === 0) return out;
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select()
        .from(pointsExpiryWarnings)
        .where(inArray(pointsExpiryWarnings.membershipId, [...membershipIds])),
    tx,
  );
  for (const r of rows) {
    const list = out.get(r.membershipId) ?? [];
    list.push({
      expiresAt: r.expiresAt,
      daysBefore: r.daysBefore as ExpiryWarningDays,
      sentAt: r.sentAt,
    });
    out.set(r.membershipId, list);
  }
  return out;
}

/** Records a warning as sent (once: false when this one was already recorded). */
export async function recordExpiryWarning(
  scope: SystemScope,
  tx: Transaction,
  input: { membershipId: string; expiresAt: Date; daysBefore: ExpiryWarningDays; sentAt: Date },
): Promise<boolean> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .insert(pointsExpiryWarnings)
        .values(input)
        .onConflictDoNothing({
          target: [
            pointsExpiryWarnings.membershipId,
            pointsExpiryWarnings.expiresAt,
            pointsExpiryWarnings.daysBefore,
          ],
        })
        .returning({ id: pointsExpiryWarnings.id }),
    tx,
  );
  return rows.length > 0;
}

/**
 * Writes the `expiry` ledger row and zeroes current-ingot progress (nothing else on the membership changes).
 * Once per expiry date: the idempotency key is the membership and the nominal date, so a second run writes
 * nothing. The row is locked by `lockExpiryCandidates`, so `gold` is the progress it read.
 */
export async function writeExpiry(
  scope: SystemScope,
  tx: Transaction,
  input: {
    membershipId: string;
    shopId: string;
    gold: number;
    nominalExpiresAt: Date;
    programVersion: number | null;
  },
): Promise<boolean> {
  return withScope(
    scope,
    async (q) => {
      const written = await q
        .insert(ledgerEntries)
        .values({
          membershipId: input.membershipId,
          shopId: input.shopId,
          type: "expiry",
          points: -input.gold,
          programVersion: input.programVersion,
          idempotencyKey: `${input.membershipId}:expiry:${input.nominalExpiresAt.toISOString()}`,
          ref: input.programVersion === null ? {} : { version: input.programVersion },
        })
        .onConflictDoNothing({ target: ledgerEntries.idempotencyKey })
        .returning({ id: ledgerEntries.id });
      if (written.length === 0) return false;
      await q
        .update(memberships)
        .set({ progressGold: 0, updatedAt: sql`now()` })
        .where(eq(memberships.id, input.membershipId));
      return true;
    },
    tx,
  );
}

/**
 * The next page of left memberships whose frozen progress is forfeit at `now` (day 31, `left_forfeit_at()`),
 * each forfeited by the database's `apply_left_forfeit()` (the same code a late rejoin runs, C-73). Returns the
 * page's ids (for the keyset) and the gold forfeited per membership (0 = a parallel run or rejoin got there).
 */
export async function forfeitLeftProgress(
  scope: SystemScope,
  tx: Transaction,
  afterId: string,
  limit: number,
  now: Date,
): Promise<{ id: string; gold: number }[]> {
  return withScope(
    scope,
    async (q) => {
      const due = await q
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            gt(memberships.id, afterId),
            isNotNull(memberships.leftAt),
            gt(memberships.progressGold, 0),
            sql`public.left_forfeit_at(${memberships.leftAt}) <= ${now.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(asc(memberships.id))
        .limit(limit);
      const out: { id: string; gold: number }[] = [];
      for (const d of due) {
        const rows = await q.execute<{ gold: number | string }>(
          sql`SELECT public.apply_left_forfeit(${d.id}::uuid, ${now.toISOString()}::timestamptz, ${newId()}::uuid) AS gold`,
        );
        out.push({ id: d.id, gold: Number(rows[0]?.gold ?? 0) });
      }
      return out;
    },
    tx,
  );
}

/**
 * C-73: the rejoin's own forfeit (customer transaction). Zeroes the caller's frozen progress when the 30-day
 * window has passed, even if the job hasn't run yet; nothing otherwise. Runs as `moz_forfeit` through the
 * SECURITY DEFINER wrapper (migration 0031): the web role itself never writes the ledger.
 */
export async function forfeitOwnLeftProgress(q: Executor, membershipId: string): Promise<number> {
  const rows = await q.execute<{ gold: number | string }>(
    sql`SELECT public.forfeit_own_left_progress(${membershipId}::uuid, ${newId()}::uuid) AS gold`,
  );
  return Number(rows[0]?.gold ?? 0);
}
