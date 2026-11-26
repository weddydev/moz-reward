import "server-only";
import { and, asc, eq, gt, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { LedgerRowForReplay } from "@/lib/loyalty/replay";
import type { SystemScope } from "@/server/authz/scope";
import {
  type IntegrityCheck,
  integrityIssues,
  ledgerEntries,
  loyaltyPrograms,
  memberships,
} from "@/server/db/schema";
import { withScope } from "./_base";
import { toVersion } from "./loyalty";

/**
 * P1-17 data-integrity reconciliation reads and the issue table (TESTING §10; ARCHITECTURE §4, §6). Read-only on
 * the business tables: these statements never change a membership, ledger, receipt or reward. Every sweep pages
 * by key (`id > $last ORDER BY id LIMIT n`), never OFFSET, under the worker role (SystemScope).
 */

export const FIRST_KEY = "00000000-0000-0000-0000-000000000000";

/** One issue found by a run: what it is about and the numbers that disagree (ids and numbers only). */
export type FoundIssue = {
  check: IntegrityCheck;
  entity: string;
  entityId: string;
  shopId: string | null;
  details: Record<string, number | string | null>;
};

export type CounterPage = {
  members: {
    id: string;
    shopId: string;
    joinedAt: Date;
    progressGold: number;
    ingotsCompleted: number;
    goldShortfall: number;
  }[];
  ledger: Map<string, LedgerRowForReplay[]>;
};

/** A page of memberships after `after` (current and left), with each one's ledger, oldest first. */
export async function counterPage(
  scope: SystemScope,
  after: string,
  limit: number,
): Promise<CounterPage> {
  return withScope(scope, async (q) => {
    const members = await q
      .select({
        id: memberships.id,
        shopId: memberships.shopId,
        joinedAt: memberships.joinedAt,
        progressGold: memberships.progressGold,
        ingotsCompleted: memberships.ingotsCompleted,
        goldShortfall: memberships.goldShortfall,
      })
      .from(memberships)
      .where(gt(memberships.id, after))
      .orderBy(asc(memberships.id))
      .limit(limit);
    const ledger = new Map<string, LedgerRowForReplay[]>();
    if (members.length === 0) return { members, ledger };
    const rows = await q
      .select({
        membershipId: ledgerEntries.membershipId,
        type: ledgerEntries.type,
        points: ledgerEntries.points,
        requestId: ledgerEntries.requestId,
        createdAt: ledgerEntries.createdAt,
        ref: ledgerEntries.ref,
      })
      .from(ledgerEntries)
      .where(
        inArray(
          ledgerEntries.membershipId,
          members.map((m) => m.id),
        ),
      )
      // One approval's rows share a transaction and a timestamp: tx order, then id, keeps them together in order.
      .orderBy(
        asc(ledgerEntries.membershipId),
        asc(ledgerEntries.createdAt),
        asc(ledgerEntries.txId),
        asc(ledgerEntries.id),
      );
    for (const r of rows) {
      const list = ledger.get(r.membershipId) ?? [];
      list.push({
        type: r.type,
        points: r.points,
        requestId: r.requestId,
        createdAt: r.createdAt,
        ref: r.ref,
      });
      ledger.set(r.membershipId, list);
    }
    return { members, ledger };
  });
}

type Row = Record<string, unknown>;
const rowsOf = (res: unknown): Row[] =>
  Array.isArray(res) ? (res as Row[]) : ((res as { rows?: Row[] }).rows ?? []);
const str = (v: unknown): string => (typeof v === "string" ? v : String(v));
const num = (v: unknown): number => Number(v);

/**
 * Receipt numbers per shop, a page of shops by id: each shop's numbers must run 1..n with none missing and none
 * twice (the unique index and the counter already make this so; the check proves it still holds).
 */
export async function receiptNumberIssues(
  scope: SystemScope,
  after: string,
  limit: number,
): Promise<{ issues: FoundIssue[]; last: string | null }> {
  return withScope(scope, async (q) => {
    const res = await q.execute(sql`
      WITH page AS (
        SELECT DISTINCT shop_id FROM receipts WHERE shop_id > ${after}::uuid ORDER BY shop_id LIMIT ${limit}
      )
      SELECT p.shop_id, count(r.id) AS n, coalesce(max(r.number), 0) AS max_number,
             count(DISTINCT r.number) AS distinct_numbers, coalesce(min(r.number), 0) AS min_number
        FROM page p JOIN receipts r ON r.shop_id = p.shop_id
       GROUP BY p.shop_id ORDER BY p.shop_id`);
    const rows = rowsOf(res);
    const issues: FoundIssue[] = rows
      .filter(
        (r) =>
          num(r["n"]) !== num(r["max_number"]) ||
          num(r["distinct_numbers"]) !== num(r["n"]) ||
          num(r["min_number"]) !== 1,
      )
      .map((r) => ({
        check: "receipt_numbers",
        entity: "shops",
        entityId: str(r["shop_id"]),
        shopId: str(r["shop_id"]),
        details: {
          receipts: num(r["n"]),
          highest: num(r["max_number"]),
          distinct: num(r["distinct_numbers"]),
        },
      }));
    const lastRow = rows[rows.length - 1];
    return { issues, last: rows.length < limit || !lastRow ? null : str(lastRow["shop_id"]) };
  });
}

/**
 * The set checks on ledger rows, rewards and requests, each a page by the driving row's id:
 * - reward_redeemed_twice: a reward with more than one confirmed code or more than one `redeem` row;
 * - redeem_not_zero: a `redeem` row whose gold isn't 0;
 * - request_approved_twice: a request with more than one `earn` row or more than one receipt;
 * - approved_without_ledger: an approved request with no `earn` row;
 * - approved_without_receipt: an approved request with no receipt 15 minutes after its approval.
 */
export async function rowIssues(
  scope: SystemScope,
  check: Exclude<IntegrityCheck, "membership_counters" | "receipt_numbers">,
  after: string,
  limit: number,
): Promise<{ issues: FoundIssue[]; last: string | null }> {
  return withScope(scope, async (q) => {
    const page = (driving: ReturnType<typeof sql>) => q.execute(driving);
    let res: unknown;
    let entity: string;
    switch (check) {
      case "reward_redeemed_twice":
        entity = "rewards";
        res = await page(sql`
          WITH page AS (SELECT id, shop_id FROM rewards WHERE id > ${after}::uuid ORDER BY id LIMIT ${limit})
          SELECT p.id, p.shop_id, (SELECT count(*) FROM redemption_codes c WHERE c.reward_id = p.id
                                     AND c.status = 'confirmed') AS confirmed,
                 (SELECT count(*) FROM ledger_entries l WHERE l.type = 'redeem'
                    AND l.ref->>'rewardId' = p.id::text) AS redeems
            FROM page p ORDER BY p.id`);
        break;
      case "redeem_not_zero":
        entity = "ledger_entries";
        res = await page(sql`
          SELECT id, shop_id, points, (type = 'redeem' AND points <> 0) AS bad
            FROM ledger_entries WHERE id > ${after}::uuid ORDER BY id LIMIT ${limit}`);
        break;
      case "request_approved_twice":
      case "approved_without_ledger":
      case "approved_without_receipt":
        entity = "point_requests";
        res = await page(sql`
          WITH page AS (SELECT id, shop_id, status, decided_at FROM point_requests
                         WHERE id > ${after}::uuid ORDER BY id LIMIT ${limit})
          SELECT p.id, p.shop_id, p.status, p.decided_at < now() - interval '15 minutes' AS settled,
                 (SELECT count(*) FROM ledger_entries l WHERE l.request_id = p.id AND l.type = 'earn') AS earns,
                 (SELECT count(*) FROM receipts r WHERE r.request_id = p.id) AS receipts
            FROM page p ORDER BY p.id`);
    }
    const rows = rowsOf(res);
    const issues: FoundIssue[] = [];
    for (const r of rows) {
      const base = {
        entity,
        entityId: str(r["id"]),
        shopId: r["shop_id"] ? str(r["shop_id"]) : null,
      };
      if (check === "reward_redeemed_twice") {
        if (num(r["confirmed"]) > 1 || num(r["redeems"]) > 1)
          issues.push({
            ...base,
            check,
            details: { confirmedCodes: num(r["confirmed"]), redeemRows: num(r["redeems"]) },
          });
      } else if (check === "redeem_not_zero") {
        if (r["bad"] === true)
          issues.push({ ...base, check, details: { points: num(r["points"]) } });
      } else if (r["status"] === "approved") {
        const earns = num(r["earns"]);
        const receipts = num(r["receipts"]);
        if (check === "request_approved_twice" && (earns > 1 || receipts > 1))
          issues.push({ ...base, check, details: { earnRows: earns, receipts } });
        if (check === "approved_without_ledger" && earns === 0)
          issues.push({ ...base, check, details: { earnRows: 0 } });
        if (check === "approved_without_receipt" && receipts === 0 && r["settled"] === true)
          issues.push({ ...base, check, details: { receipts: 0 } });
      }
    }
    const lastRow = rows[rows.length - 1];
    return { issues, last: rows.length < limit || !lastRow ? null : str(lastRow["id"]) };
  });
}

/**
 * Records a run's findings for one check: a new issue gets a row; one still open keeps its `detected_at` (only
 * `last_seen_at` and the numbers move); an open issue of this check the run no longer found is resolved.
 * Returns the issues that are new (for the alert).
 */
export async function recordIssues(
  scope: SystemScope,
  check: IntegrityCheck,
  found: readonly FoundIssue[],
): Promise<FoundIssue[]> {
  return withScope(scope, async (q) => {
    const fresh: FoundIssue[] = [];
    for (const f of found) {
      const [row] = await q
        .insert(integrityIssues)
        .values({
          check: f.check,
          entity: f.entity,
          entityId: f.entityId,
          shopId: f.shopId,
          details: f.details,
        })
        .onConflictDoUpdate({
          target: [integrityIssues.check, integrityIssues.entityId],
          targetWhere: isNull(integrityIssues.resolvedAt),
          set: { lastSeenAt: sql`now()`, details: f.details },
        })
        .returning({
          detectedAt: integrityIssues.detectedAt,
          lastSeenAt: integrityIssues.lastSeenAt,
        });
      if (row && row.detectedAt.getTime() === row.lastSeenAt.getTime()) fresh.push(f);
    }
    const stillOpen = found.map((f) => f.entityId);
    await q
      .update(integrityIssues)
      .set({ resolvedAt: sql`now()` })
      .where(
        and(
          eq(integrityIssues.check, check),
          isNull(integrityIssues.resolvedAt),
          stillOpen.length > 0 ? notInArray(integrityIssues.entityId, stillOpen) : undefined,
        ),
      );
    return fresh;
  });
}

/** Each shop's programme versions, oldest first (the replay's terms). */
export async function versionsOf(
  scope: SystemScope,
  shopIds: readonly string[],
): Promise<Map<string, ProgrammeVersion[]>> {
  const out = new Map<string, ProgrammeVersion[]>();
  if (shopIds.length === 0) return out;
  const rows = await withScope(scope, (q) =>
    q
      .select()
      .from(loyaltyPrograms)
      .where(inArray(loyaltyPrograms.shopId, [...shopIds]))
      .orderBy(asc(loyaltyPrograms.shopId), asc(loyaltyPrograms.version)),
  );
  for (const r of rows) {
    const list = out.get(r.shopId) ?? [];
    list.push(toVersion(r));
    out.set(r.shopId, list);
  }
  return out;
}
