import "server-only";
import { and, asc, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
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
import { readSnapshot, transaction, withScope } from "./_base";
import { toVersion } from "./loyalty";

/**
 * P1-17 data-integrity reconciliation reads and the issue table (TESTING §10; ARCHITECTURE §4, §6). Read-only on
 * the business tables: every check page runs in `readSnapshot` (one REPEATABLE READ, READ ONLY transaction), so
 * a membership and its ledger are read from one snapshot and the database refuses any write. Every sweep pages
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
  // One snapshot: an approval committing between the two reads would otherwise look like a counter mismatch.
  return readSnapshot(scope, async (q) => {
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
  return readSnapshot(scope, async (q) => {
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

/** The passes over rows: one per reward/ledger check, and one over requests that feeds all three request checks. */
export type RowPass = "reward_redeemed_twice" | "redeem_not_zero" | "requests";
export const REQUEST_CHECKS = [
  "request_approved_twice",
  "approved_without_ledger",
  "approved_without_receipt",
] as const satisfies readonly IntegrityCheck[];

/**
 * The set checks on ledger rows, rewards and requests, each a page by the driving row's id (the three request
 * checks share one pass over `point_requests`: P1-D close review LOW):
 * - reward_redeemed_twice: a reward with more than one confirmed code or more than one `redeem` row;
 * - redeem_not_zero: a `redeem` row whose gold isn't 0;
 * - request_approved_twice: a request with more than one `earn` row or more than one receipt;
 * - approved_without_ledger: an approved request with no `earn` row;
 * - approved_without_receipt: an approved request with no receipt 15 minutes after its approval.
 */
export async function rowIssues(
  scope: SystemScope,
  pass: RowPass,
  after: string,
  limit: number,
): Promise<{ issues: FoundIssue[]; last: string | null }> {
  return readSnapshot(scope, async (q) => {
    const page = (driving: ReturnType<typeof sql>) => q.execute(driving);
    let res: unknown;
    let entity: string;
    switch (pass) {
      case "reward_redeemed_twice":
        entity = "rewards";
        // The redeem count goes through the partial index on `ref->>'rewardId'` (drizzle/concurrent/0036): one
        // index probe per reward, not a ledger scan per reward (P1-D close review HIGH).
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
        // Only the bad rows come back: a healthy ledger is one pass with an empty page.
        res = await page(sql`
          SELECT id, shop_id, points, true AS bad FROM ledger_entries
           WHERE id > ${after}::uuid AND type = 'redeem' AND points <> 0 ORDER BY id LIMIT ${limit}`);
        break;
      case "requests":
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
      if (pass === "reward_redeemed_twice") {
        if (num(r["confirmed"]) > 1 || num(r["redeems"]) > 1)
          issues.push({
            ...base,
            check: pass,
            details: { confirmedCodes: num(r["confirmed"]), redeemRows: num(r["redeems"]) },
          });
      } else if (pass === "redeem_not_zero") {
        if (r["bad"] === true)
          issues.push({ ...base, check: pass, details: { points: num(r["points"]) } });
      } else if (r["status"] === "approved") {
        const earns = num(r["earns"]);
        const receipts = num(r["receipts"]);
        if (earns > 1 || receipts > 1)
          issues.push({
            ...base,
            check: "request_approved_twice",
            details: { earnRows: earns, receipts },
          });
        if (earns === 0)
          issues.push({ ...base, check: "approved_without_ledger", details: { earnRows: 0 } });
        if (receipts === 0 && r["settled"] === true)
          issues.push({ ...base, check: "approved_without_receipt", details: { receipts: 0 } });
      }
    }
    const lastRow = rows[rows.length - 1];
    return { issues, last: rows.length < limit || !lastRow ? null : str(lastRow["id"]) };
  });
}

/** Rows per upsert statement: 5 parameters each, far below Postgres's 65,535 bind parameters. */
const RECORD_BATCH = 1_000;

/**
 * Records a run's findings for one check, in one transaction: a new issue gets a row; one still open keeps its
 * `detected_at` (only `last_seen_at` and the numbers move); an open issue of this check the run no longer found
 * is resolved. Upserts go in batches and every row they touch gets `last_seen_at = now()` (the transaction's
 * start), so "no longer found" is `last_seen_at < now()`: no list of ids, whatever the count (P1-D close review).
 * Returns the issues that are new (for the alert) and how many were resolved (for the sweep's audit row).
 */
export async function recordIssues(
  scope: SystemScope,
  check: IntegrityCheck,
  found: readonly FoundIssue[],
): Promise<{ fresh: FoundIssue[]; resolved: number }> {
  // One row per entity: a statement may not upsert the same row twice.
  const unique = [...new Map(found.map((f) => [f.entityId, f])).values()];
  // A real transaction (the system scope's withScope would run each statement on its own): `now()` must be the
  // same instant for the upserts and the resolve.
  return transaction(scope, async (q) => {
    const fresh: FoundIssue[] = [];
    for (let i = 0; i < unique.length; i += RECORD_BATCH) {
      const batch = unique.slice(i, i + RECORD_BATCH);
      const rows = await q
        .insert(integrityIssues)
        .values(
          batch.map((f) => ({
            check: f.check,
            entity: f.entity,
            entityId: f.entityId,
            shopId: f.shopId,
            details: f.details,
          })),
        )
        .onConflictDoUpdate({
          target: [integrityIssues.check, integrityIssues.entityId],
          targetWhere: isNull(integrityIssues.resolvedAt),
          set: { lastSeenAt: sql`now()`, details: sql`excluded.details` },
        })
        .returning({
          entityId: integrityIssues.entityId,
          detectedAt: integrityIssues.detectedAt,
          lastSeenAt: integrityIssues.lastSeenAt,
        });
      const byId = new Map(batch.map((f) => [f.entityId, f]));
      for (const row of rows) {
        const f = byId.get(row.entityId);
        if (f && row.detectedAt.getTime() === row.lastSeenAt.getTime()) fresh.push(f);
      }
    }
    const resolved = await q
      .update(integrityIssues)
      .set({ resolvedAt: sql`now()` })
      .where(
        and(
          eq(integrityIssues.check, check),
          isNull(integrityIssues.resolvedAt),
          lt(integrityIssues.lastSeenAt, sql`now()`),
        ),
      )
      .returning({ id: integrityIssues.id });
    return { fresh, resolved: resolved.length };
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

export type OpenIssue = {
  check: IntegrityCheck;
  entity: string;
  entityId: string;
  shopId: string | null;
  detectedAt: Date;
  details: unknown;
};

/**
 * The open issues for an operator (RUNBOOK §20, `integrity-check` CLI): how many per check, and the oldest `limit`
 * of each. Ids and numbers only, never personal data (the table holds nothing else).
 */
export async function openIssueSummary(
  scope: SystemScope,
  limit: number,
): Promise<{ counts: Partial<Record<IntegrityCheck, number>>; oldest: OpenIssue[] }> {
  return withScope(scope, async (q) => {
    const rows = await q
      .select({ check: integrityIssues.check, n: count() })
      .from(integrityIssues)
      .where(isNull(integrityIssues.resolvedAt))
      .groupBy(integrityIssues.check);
    const counts: Partial<Record<IntegrityCheck, number>> = {};
    for (const r of rows) counts[r.check] = r.n;
    const oldest: OpenIssue[] = [];
    for (const check of Object.keys(counts) as IntegrityCheck[])
      oldest.push(
        ...(await q
          .select({
            check: integrityIssues.check,
            entity: integrityIssues.entity,
            entityId: integrityIssues.entityId,
            shopId: integrityIssues.shopId,
            detectedAt: integrityIssues.detectedAt,
            details: integrityIssues.details,
          })
          .from(integrityIssues)
          .where(and(eq(integrityIssues.check, check), isNull(integrityIssues.resolvedAt)))
          .orderBy(asc(integrityIssues.detectedAt), asc(integrityIssues.id))
          .limit(limit)),
      );
    return { counts, oldest };
  });
}
