import "server-only";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import type { DayTotals } from "@/lib/dashboard/kpis";
import { LONDON_TZ } from "@/lib/time";
import type { ShopScope } from "@/server/authz/scope";
import { memberships } from "@/server/db/schema/core";
import { type LedgerType, ledgerEntries } from "@/server/db/schema/ledger";
import { inShop, transaction, withScope } from "./_base";

/**
 * Gold the shop handed out: earned and bonus gold, less reversals (a refunded award takes its gold back on the
 * day it was reversed). Redeem rows carry 0 and expiry isn't the shop giving gold, so neither counts
 * (DECISIONS 28 Nov "dashboard KPIs").
 */
export const ISSUED_TYPES = [
  "earn",
  "bonus_streak",
  "bonus_referral",
  "bonus_game",
  "reversal",
] as const satisfies readonly LedgerType[];

export type { DayTotals };

/**
 * The shop's per-UK-day totals in `[from, to)` (P2-01 Overview KPIs and the weekly visits chart): visits =
 * approved visits (one `earn` row each), gold = `ISSUED_TYPES`, joins = memberships started that day (members
 * who left since still joined that day). Keyed by UK date (YYYY-MM-DD); days with nothing are absent. Scoped
 * twice: `shop_id = scope.shopId` in the query and RLS on both tables.
 */
export async function readDailyTotals(
  scope: ShopScope,
  range: { from: Date; to: Date },
): Promise<Map<string, DayTotals>> {
  return transaction(scope, async (tx) => {
    const ledgerDay = sql<string>`to_char(${ledgerEntries.createdAt} AT TIME ZONE ${LONDON_TZ}, 'YYYY-MM-DD')`;
    const joinDay = sql<string>`to_char(${memberships.joinedAt} AT TIME ZONE ${LONDON_TZ}, 'YYYY-MM-DD')`;
    const [ledger, joins] = [
      await withScope(
        scope,
        (q) =>
          q
            .select({
              date: ledgerDay,
              visits: sql<number>`count(*) FILTER (WHERE ${ledgerEntries.type} = 'earn')::int`,
              gold: sql<number>`coalesce(sum(${ledgerEntries.points}), 0)::int`,
            })
            .from(ledgerEntries)
            .where(
              inShop(
                ledgerEntries.shopId,
                scope,
                and(
                  gte(ledgerEntries.createdAt, range.from),
                  lt(ledgerEntries.createdAt, range.to),
                  inArray(ledgerEntries.type, [...ISSUED_TYPES]),
                ),
              ),
            )
            .groupBy(sql`1`),
        tx,
      ),
      await withScope(
        scope,
        (q) =>
          q
            .select({ date: joinDay, joins: sql<number>`count(*)::int` })
            .from(memberships)
            .where(
              inShop(
                memberships.shopId,
                scope,
                and(gte(memberships.joinedAt, range.from), lt(memberships.joinedAt, range.to)),
              ),
            )
            .groupBy(sql`1`),
        tx,
      ),
    ];
    const out = new Map<string, DayTotals>();
    const at = (date: string): DayTotals => {
      let row = out.get(date);
      if (!row) {
        row = { visits: 0, gold: 0, joins: 0 };
        out.set(date, row);
      }
      return row;
    };
    for (const r of ledger) Object.assign(at(r.date), { visits: r.visits, gold: r.gold });
    for (const r of joins) at(r.date).joins = r.joins;
    return out;
  });
}
