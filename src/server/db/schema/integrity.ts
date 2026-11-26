/**
 * P1-17 data-integrity reconciliation (TESTING §10; ARCHITECTURE §4 `integrity_issues`). The nightly job (and an
 * admin's on-demand run) records each mismatch it finds here, one open row per (check, entity); it never fixes
 * data. A still-open issue keeps its `detected_at` (`last_seen_at` moves); one the next run no longer finds is
 * resolved. `details` holds ids and numbers only. Worker writes; admins read (migration 0035).
 */
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, tz } from "./_columns";

export const INTEGRITY_CHECKS = [
  "membership_counters",
  "receipt_numbers",
  "reward_redeemed_twice",
  "redeem_not_zero",
  "request_approved_twice",
  "approved_without_ledger",
  "approved_without_receipt",
] as const;
export type IntegrityCheck = (typeof INTEGRITY_CHECKS)[number];
export const integrityCheck = pgEnum("integrity_check", INTEGRITY_CHECKS);

export const integrityIssues = pgTable(
  "integrity_issues",
  {
    id: id(),
    check: integrityCheck().notNull(),
    /** The table the issue is about: memberships, shops, rewards, ledger_entries, point_requests. */
    entity: text().notNull(),
    entityId: uuid().notNull(),
    shopId: uuid(),
    details: jsonb().$type<Record<string, number | string | null>>().notNull().default({}),
    detectedAt: tz().notNull().defaultNow(),
    lastSeenAt: tz().notNull().defaultNow(),
    resolvedAt: tz(),
  },
  (t) => [
    uniqueIndex("integrity_issues_open_uq")
      .on(t.check, t.entityId)
      .where(sql`${t.resolvedAt} IS NULL`),
    index("integrity_issues_detected_idx").on(t.detectedAt),
    check("integrity_issues_entity_length", sql`char_length(${t.entity}) BETWEEN 1 AND 40`),
    check("integrity_issues_details_object", sql`jsonb_typeof(${t.details}) = 'object'`),
  ],
);
