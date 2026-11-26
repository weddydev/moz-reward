import "server-only";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { ShopId } from "@/lib/brand";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { ClosureRow, HoursRow } from "@/lib/open-status";
import { addDays } from "@/lib/time";
import type { CustomerScope } from "@/server/authz/scope";
import {
  ledgerEntries,
  loyaltyPrograms,
  memberships,
  rewards,
  shopClosures,
  shopHours,
  shops,
} from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";
import { toVersion } from "./loyalty";

export type WalletMembership = {
  membershipId: string;
  shopId: ShopId;
  name: string;
  addressLine1: string | null;
  town: string | null;
  postcode: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: (typeof shops.$inferSelect)["status"];
  joinedAt: Date;
  purchaseCount: number;
  lastVisitAt: Date | null;
  progressGold: number;
  ingotsCompleted: number;
  /** When the current ingot started (null = at `joinedAt`, C-60). */
  ingotStartedAt: Date | null;
  goldShortfall: number;
};

/** One approved visit in the Wallet's recent activity: earn plus any streak bonus of that request. */
export type WalletActivity = { shopId: string; requestId: string; gold: number; at: Date };

/** How many awards per membership feed the "N more visits" estimate. */
export const RECENT_AWARDS = 10;
/** Rows in the Wallet's recent activity. */
export const RECENT_ACTIVITY = 5;

export type WalletRead = {
  memberships: WalletMembership[];
  /** Every programme version of each shop, oldest first (the ingot's terms come from the version it started under). */
  programmes: Map<string, ProgrammeVersion[]>;
  hours: Map<string, HoursRow[]>;
  closures: Map<string, ClosureRow[]>;
  /** Unlocked rewards not yet redeemed, across the current memberships. */
  rewardsReady: number;
  /** The last approved visits across the current memberships, newest first. */
  activity: WalletActivity[];
  /** Each membership's last earn amounts (gold), oldest first: the estimate behind "N more visits". */
  recentAwards: Map<string, number[]>;
};

const group = <T extends { shopId: string }, U>(
  rows: readonly T[],
  pick: (row: T) => U,
): Map<string, U[]> => {
  const out = new Map<string, U[]>();
  for (const row of rows) {
    const list = out.get(row.shopId);
    if (list) list.push(pick(row));
    else out.set(row.shopId, [pick(row)]);
  }
  return out;
};

/**
 * The customer's Wallet (P1-07): their current memberships (left ones hidden) with each shop's public identity,
 * programme versions, opening hours and the closures around `today`, plus (P1-12, C-62) the rewards ready, the
 * recent activity and each membership's last awards from the ledger. A fixed number of statements whatever the
 * membership count: the memberships join, then one query per table for all those shops or memberships at once
 * (`inArray`), in one scoped transaction. RLS limits every table to what this customer may see (memberships_own,
 * shops_public, loyalty_programs_member_read, hours/closures visible with the shop, ledger_entries_own_read,
 * rewards_own_read).
 */
export async function readOwnWallet(
  scope: CustomerScope,
  /** Today in London (YYYY-MM-DD): the closures window is built around it, never the DB clock. */
  today: string,
): Promise<WalletRead> {
  return withScope(scope, async (q) => {
    const rows = await q
      .select({
        membershipId: memberships.id,
        shopId: shops.id,
        name: shops.name,
        tradingName: shops.tradingName,
        addressLine1: shops.addressLine1,
        town: shops.town,
        postcode: shops.postcode,
        logoUrl: shops.logoUrl,
        coverUrl: shops.coverUrl,
        status: shops.status,
        joinedAt: memberships.joinedAt,
        purchaseCount: memberships.purchaseCount,
        lastVisitAt: memberships.lastVisitAt,
        progressGold: memberships.progressGold,
        ingotsCompleted: memberships.ingotsCompleted,
        ingotStartedAt: memberships.ingotStartedAt,
        goldShortfall: memberships.goldShortfall,
      })
      .from(memberships)
      .innerJoin(shops, eq(shops.id, memberships.shopId))
      .where(and(ownedBy(memberships.userId, scope), isNull(memberships.leftAt)));
    const empty: WalletRead = {
      memberships: [],
      programmes: new Map(),
      hours: new Map(),
      closures: new Map(),
      rewardsReady: 0,
      activity: [],
      recentAwards: new Map(),
    };
    if (rows.length === 0) return empty;
    const ids = rows.map((r) => r.shopId);
    const mids = rows.map((r) => r.membershipId);
    const visitAt = sql<Date>`max(${ledgerEntries.createdAt})`.mapWith(ledgerEntries.createdAt);
    const ranked = q
      .select({
        membershipId: ledgerEntries.membershipId,
        points: ledgerEntries.points,
        rank: sql<number>`row_number() OVER (PARTITION BY ${ledgerEntries.membershipId} ORDER BY ${ledgerEntries.createdAt} DESC, ${ledgerEntries.id} DESC)`
          .mapWith(Number)
          .as("rank"),
      })
      .from(ledgerEntries)
      .where(and(inArray(ledgerEntries.membershipId, mids), eq(ledgerEntries.type, "earn")))
      .as("ranked");
    const [programmes, hours, closures, ready, activity, awards] = await Promise.all([
      q
        .select()
        .from(loyaltyPrograms)
        .where(inArray(loyaltyPrograms.shopId, ids))
        .orderBy(asc(loyaltyPrograms.shopId), asc(loyaltyPrograms.version)),
      q
        .select({
          shopId: shopHours.shopId,
          weekday: shopHours.weekday,
          opens: shopHours.opens,
          closes: shopHours.closes,
        })
        .from(shopHours)
        .where(inArray(shopHours.shopId, ids))
        .orderBy(asc(shopHours.weekday), asc(shopHours.opens)),
      q
        .select({ shopId: shopClosures.shopId, date: shopClosures.date })
        .from(shopClosures)
        .where(
          and(
            inArray(shopClosures.shopId, ids),
            gte(shopClosures.date, addDays(today, -1)),
            lt(shopClosures.date, addDays(today, 8)),
          ),
        ),
      q
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(rewards)
        .where(
          and(
            inArray(rewards.membershipId, mids),
            isNull(rewards.redeemedAt),
            // P1-16: an expired reward is no longer ready (the list beside it uses the same rule).
            gt(rewards.expiresAt, sql`now()`),
          ),
        ),
      q
        .select({
          shopId: ledgerEntries.shopId,
          requestId: ledgerEntries.requestId,
          gold: sql<number>`sum(${ledgerEntries.points})`.mapWith(Number),
          at: visitAt,
        })
        .from(ledgerEntries)
        .where(
          and(
            inArray(ledgerEntries.membershipId, mids),
            inArray(ledgerEntries.type, ["earn", "bonus_streak"]),
          ),
        )
        .groupBy(ledgerEntries.shopId, ledgerEntries.requestId)
        .orderBy(desc(visitAt))
        .limit(RECENT_ACTIVITY),
      q
        .select({ membershipId: ranked.membershipId, points: ranked.points })
        .from(ranked)
        .where(lte(ranked.rank, RECENT_AWARDS))
        .orderBy(asc(ranked.membershipId), desc(ranked.rank)),
    ]);
    const recentAwards = new Map<string, number[]>();
    for (const a of awards) {
      const list = recentAwards.get(a.membershipId);
      if (list) list.push(a.points);
      else recentAwards.set(a.membershipId, [a.points]);
    }
    return {
      memberships: rows.map(({ tradingName, ...r }) => ({ ...r, name: tradingName ?? r.name })),
      programmes: group(programmes, toVersion),
      hours: group(hours, (h) => ({
        weekday: h.weekday,
        opens: h.opens.slice(0, 5),
        closes: h.closes.slice(0, 5),
      })),
      closures: group(closures, (c) => ({ date: c.date })),
      rewardsReady: ready[0]?.n ?? 0,
      // Every earn row carries its request (0029); the filter only narrows the type.
      activity: activity.flatMap((a) =>
        a.requestId ? [{ shopId: a.shopId, requestId: a.requestId, gold: a.gold, at: a.at }] : [],
      ),
      recentAwards,
    };
  });
}
