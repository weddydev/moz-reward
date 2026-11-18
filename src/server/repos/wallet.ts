import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { ShopId } from "@/lib/brand";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { ClosureRow, HoursRow } from "@/lib/open-status";
import { addDays } from "@/lib/time";
import type { CustomerScope } from "@/server/authz/scope";
import { loyaltyPrograms, memberships, shopClosures, shopHours, shops } from "@/server/db/schema";
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
};

export type WalletRead = {
  memberships: WalletMembership[];
  /** Every programme version of each shop, oldest first (the ingot's terms come from the version it started under). */
  programmes: Map<string, ProgrammeVersion[]>;
  hours: Map<string, HoursRow[]>;
  closures: Map<string, ClosureRow[]>;
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
 * programme versions, opening hours and the closures around `today`. A fixed number of statements whatever the
 * membership count: the memberships join, then programmes, hours and closures for all those shops at once
 * (`inArray`), in one scoped transaction. RLS limits every table to what this customer may see (memberships_own,
 * shops_public, loyalty_programs_member_read, hours/closures visible with the shop).
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
      })
      .from(memberships)
      .innerJoin(shops, eq(shops.id, memberships.shopId))
      .where(and(ownedBy(memberships.userId, scope), isNull(memberships.leftAt)));
    const empty: WalletRead = {
      memberships: [],
      programmes: new Map(),
      hours: new Map(),
      closures: new Map(),
    };
    if (rows.length === 0) return empty;
    const ids = rows.map((r) => r.shopId);
    const [programmes, hours, closures] = await Promise.all([
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
    ]);
    return {
      memberships: rows.map(({ tradingName, ...r }) => ({ ...r, name: tradingName ?? r.name })),
      programmes: group(programmes, toVersion),
      hours: group(hours, (h) => ({
        weekday: h.weekday,
        opens: h.opens.slice(0, 5),
        closes: h.closes.slice(0, 5),
      })),
      closures: group(closures, (c) => ({ date: c.date })),
    };
  });
}
