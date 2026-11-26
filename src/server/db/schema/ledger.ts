/**
 * P1-12 loyalty records (PRODUCT §5, §6, §11; ARCHITECTURE §4; ENGINEERING §6–7). Migration 0029 adds the
 * guards, grants and RLS that make these walls (append-only ledger, self-award ban, staff limit, reversal
 * authority, gapless receipt numbers) hold in the database, not only in the approval service.
 *
 * Erasure and resets: `ledger_entries` has no foreign keys (append-only rows survive a user's erasure,
 * pseudonymous: the membership id only). `rewards` and `receipts` name the membership without a foreign key
 * too (business records kept pseudonymous after erasure, DECISIONS 26 Nov), and cascade only from their shop
 * (shops are never hard-deleted in production; the demo reset and tests do, and the counter goes with them).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, tz } from "./_columns";
import { memberships, shops } from "./core";

export const LEDGER_TYPES = [
  "earn",
  "bonus_streak",
  "bonus_referral",
  "bonus_game",
  "redeem",
  "reversal",
  "expiry",
  "adjustment",
] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];
export const ledgerType = pgEnum("ledger_type", LEDGER_TYPES);

/** Preset reasons for a reversal (PRODUCT §5); stored in the ledger's `ref` as a code, never free text. */
export const REVERSAL_REASONS = ["refund", "mistake", "wrong_customer", "other"] as const;
export type ReversalReason = (typeof REVERSAL_REASONS)[number];

/** Hard bound on one ledger row's gold (the platform cap is far below; this only stops absurd values). */
export const LEDGER_POINTS_BOUND = 100_000;

/**
 * Append-only gold movements (UPDATE/DELETE/TRUNCATE blocked by trigger for every role). `points` is the signed
 * change: earn and bonuses > 0, reversal and expiry < 0, redeem 0. `ref` holds ids, numbers and codes only
 * (CHECK on its keys), never names, emails, phones or free text.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: id(),
    membershipId: uuid().notNull(),
    /** Copied for RLS and the shop's queries (no FK: rows outlive their shop's demo reset). */
    shopId: uuid().notNull(),
    type: ledgerType().notNull(),
    points: integer().notNull(),
    programVersion: integer(),
    requestId: uuid(),
    receiptId: uuid(),
    /** One row per movement: `<requestId>:earn`, `<requestId>:bonus_streak`, `<receiptId>:reversal`. */
    idempotencyKey: text().notNull(),
    ref: jsonb().$type<Record<string, string | number | boolean>>().notNull().default({}),
    createdBy: uuid(),
    /** The writing transaction (database-stamped): the memberships and rewards guards check it. */
    txId: bigint({ mode: "bigint" })
      .notNull()
      .default(sql`txid_current()`),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_entries_idempotency_key_uq").on(t.idempotencyKey),
    uniqueIndex("ledger_entries_one_reversal_uq")
      .on(t.receiptId)
      .where(sql`${t.type} = 'reversal'`),
    index("ledger_entries_membership_created_idx").on(t.membershipId, t.createdAt),
    index("ledger_entries_membership_tx_idx").on(t.membershipId, t.txId),
    index("ledger_entries_shop_created_idx").on(t.shopId, t.createdAt),
    index("ledger_entries_request_idx").on(t.requestId),
    index("ledger_entries_receipt_idx").on(t.receiptId),
    check(
      "ledger_entries_points_by_type",
      sql`CASE ${t.type}
        WHEN 'earn' THEN ${t.points} > 0
        WHEN 'bonus_streak' THEN ${t.points} > 0
        WHEN 'bonus_referral' THEN ${t.points} > 0
        WHEN 'bonus_game' THEN ${t.points} > 0
        WHEN 'redeem' THEN ${t.points} = 0
        WHEN 'reversal' THEN ${t.points} < 0
        WHEN 'expiry' THEN ${t.points} < 0
        ELSE ${t.points} <> 0 END`,
    ),
    check("ledger_entries_points_bound", sql`abs(${t.points}) <= 100000`),
    check(
      "ledger_entries_idempotency_key_length",
      sql`char_length(${t.idempotencyKey}) BETWEEN 8 AND 100`,
    ),
    check(
      "ledger_entries_ref_shape",
      sql`jsonb_typeof(${t.ref}) = 'object'
        AND ${t.ref} - ARRAY['receiptId', 'requestId', 'rewardId', 'redemptionId', 'reason', 'multiplierPercent', 'base', 'version', 'ingots'] = '{}'::jsonb`,
    ),
  ],
);

export const rewardKind = pgEnum("reward_kind", ["main", "milestone", "game", "other"]);

/**
 * A reward a member unlocked (an ingot's main reward, a milestone). Never revoked. `expires_at` is set by the
 * database at unlock (0034: the end of the London day `reward_valid_days` after it, from the reward's programme
 * version) and never changes; `redeemed_at` is set once, by the team's confirm of a redeem code (P1-16).
 */
export const rewards = pgTable(
  "rewards",
  {
    id: id(),
    membershipId: uuid().notNull(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    kind: rewardKind().notNull(),
    /** The programme's reward text at unlock (shop-written, ≤ 60 in the programme; ≤ 120 here). */
    label: text().notNull(),
    ingotNumber: integer().notNull(),
    milestonePercent: smallint(),
    rewardsVersion: integer().notNull(),
    isMystery: boolean().notNull().default(false),
    requestId: uuid(),
    unlockedAt: tz().notNull().defaultNow(),
    /** Always set by the `rewards_guard` trigger (0034); the default is only a placeholder it replaces. */
    expiresAt: tz().notNull().defaultNow(),
    redeemedAt: tz(),
  },
  (t) => [
    uniqueIndex("rewards_once_per_ingot_uq").on(
      t.membershipId,
      t.ingotNumber,
      t.kind,
      sql`coalesce(${t.milestonePercent}, 0)`,
    ),
    index("rewards_membership_unlocked_idx").on(t.membershipId, t.unlockedAt),
    index("rewards_shop_id_idx").on(t.shopId),
    index("rewards_membership_ready_idx")
      .on(t.membershipId, t.expiresAt)
      .where(sql`${t.redeemedAt} IS NULL`),
    check("rewards_label_length", sql`char_length(${t.label}) BETWEEN 1 AND 120`),
    check(
      "rewards_redeemed_after_unlock",
      sql`${t.redeemedAt} IS NULL OR ${t.redeemedAt} >= ${t.unlockedAt}`,
    ),
    check("rewards_ingot_number_positive", sql`${t.ingotNumber} >= 1`),
    check(
      "rewards_milestone_has_percent",
      sql`(${t.kind} = 'milestone') = (${t.milestonePercent} IS NOT NULL)`,
    ),
  ],
);

export const REDEMPTION_STATUSES = ["live", "voided", "confirmed"] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];
export const redemptionStatus = pgEnum("redemption_status", REDEMPTION_STATUSES);
export const REDEMPTION_VOID_REASONS = ["regenerated", "left", "erased"] as const;
export const redemptionVoidReason = pgEnum("redemption_void_reason", REDEMPTION_VOID_REASONS);

/**
 * Redeem codes (P1-16, PRODUCT §6; ARCHITECTURE §4; SECURITY §6). The customer's Redeem creates a live code for
 * 15 minutes; the team's confirm turns it into the redemption (`confirmed`, the reward's `redeemed_at`, a 0-gold
 * `redeem` ledger row). The code itself is never stored: `code_hash` is an HMAC of shop + code (purpose
 * `redeem-code`), so nobody reading the table (a team member, a leaked backup) can redeem a live code; the
 * customer sees the code only in the response that made it. One live code per member (generating voids the
 * previous one) and per (shop, hash). Migration 0034 holds the guards, grants and RLS. P3 claims add
 * `offer_claim_id`.
 */
export const redemptionCodes = pgTable(
  "redemption_codes",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** No FK, like rewards (pseudonymous after erasure). */
    membershipId: uuid().notNull(),
    rewardId: uuid()
      .notNull()
      .references(() => rewards.id, { onDelete: "cascade" }),
    /** HMAC-SHA256(redeem-code key, shopId|code), hex. */
    codeHash: text().notNull(),
    status: redemptionStatus().notNull().default("live"),
    expiresAt: tz().notNull(),
    voidedAt: tz(),
    voidReason: redemptionVoidReason(),
    confirmedBy: uuid(),
    confirmedAt: tz(),
    /** The confirming transaction (database-stamped): the rewards and ledger guards check it. */
    confirmTxId: bigint({ mode: "bigint" }),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("redemption_codes_live_code_uq")
      .on(t.shopId, t.codeHash)
      .where(sql`${t.status} = 'live'`),
    uniqueIndex("redemption_codes_live_member_uq")
      .on(t.membershipId)
      .where(sql`${t.status} = 'live'`),
    uniqueIndex("redemption_codes_confirmed_reward_uq")
      .on(t.rewardId)
      .where(sql`${t.status} = 'confirmed'`),
    index("redemption_codes_lookup_idx").on(t.shopId, t.codeHash, t.createdAt),
    index("redemption_codes_shop_live_idx")
      .on(t.shopId, t.expiresAt)
      .where(sql`${t.status} = 'live'`),
    index("redemption_codes_reward_idx").on(t.rewardId),
    check("redemption_codes_hash_shape", sql`${t.codeHash} ~ '^[0-9a-f]{64}$'`),
    check("redemption_codes_window", sql`${t.expiresAt} = ${t.createdAt} + interval '15 minutes'`),
    check(
      "redemption_codes_status_shape",
      sql`CASE ${t.status}
        WHEN 'live' THEN ${t.voidedAt} IS NULL AND ${t.voidReason} IS NULL AND ${t.confirmedAt} IS NULL AND ${t.confirmedBy} IS NULL AND ${t.confirmTxId} IS NULL
        WHEN 'voided' THEN ${t.voidedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL AND ${t.confirmedAt} IS NULL AND ${t.confirmedBy} IS NULL AND ${t.confirmTxId} IS NULL
        ELSE ${t.voidedAt} IS NULL AND ${t.voidReason} IS NULL AND ${t.confirmedAt} IS NOT NULL AND ${t.confirmedBy} IS NOT NULL AND ${t.confirmTxId} IS NOT NULL END`,
    ),
  ],
);

/** What a receipt shows (snapshot at approval: the PDF renders from this alone, PRODUCT §11). No customer data. */
export type ReceiptData = {
  shopName: string;
  address: string | null;
  vatNumber: string | null;
  requestedAt: string;
  approvedAt: string;
  items: string[];
  amountPence: number | null;
  goldEarned: number;
  bonusGold: number;
  /** The approving team member's initials (≤ 3 letters; DECISIONS 26 Nov). */
  staffInitials: string;
};

export const receipts = pgTable(
  "receipts",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    membershipId: uuid().notNull(),
    requestId: uuid().notNull(),
    /** Per shop, gapless from 1 (`shop_receipt_counters`, locked in the approval transaction). */
    number: integer().notNull(),
    data: jsonb().$type<ReceiptData>().notNull(),
    /** Private storage key of the rendered PDF (the worker sets it). */
    pdfKey: text(),
    createdBy: uuid().notNull(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("receipts_request_uq").on(t.requestId),
    uniqueIndex("receipts_shop_number_uq").on(t.shopId, t.number),
    index("receipts_membership_created_idx").on(t.membershipId, t.createdAt),
    check("receipts_number_positive", sql`${t.number} >= 1`),
    check("receipts_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);

/** The last receipt number of each shop (one row per shop; +1 under a row lock in the approval). */
export const shopReceiptCounters = pgTable(
  "shop_receipt_counters",
  {
    shopId: uuid()
      .primaryKey()
      .references(() => shops.id, { onDelete: "cascade" }),
    lastNumber: integer().notNull(),
  },
  (t) => [check("shop_receipt_counters_positive", sql`${t.lastNumber} >= 1`)],
);

export const fraudFlagStatus = pgEnum("fraud_flag_status", ["open", "dismissed", "confirmed"]);

/** Rule hits for the admin fraud monitor (P4-08 adds rules and the screen). Ids and numbers only. */
export const fraudFlags = pgTable(
  "fraud_flags",
  {
    id: id(),
    rule: text().notNull(),
    entity: text().notNull(),
    entityId: uuid().notNull(),
    details: jsonb().$type<Record<string, string | number>>().notNull().default({}),
    status: fraudFlagStatus().notNull().default("open"),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("fraud_flags_rule_entity_uq").on(t.rule, t.entity, t.entityId),
    index("fraud_flags_status_created_idx").on(t.status, t.createdAt),
  ],
);

/**
 * P1-13: the points-expiry warnings the daily job sent (PRODUCT §6), one per member, announced expiry date and
 * notice (30 or 7 days). The job's own record that each warning went out once, and when: the notice floor
 * (engine `planExpiry`) measures from `sentAt`. An approved visit moves the expiry date, so warnings for the old
 * date stop counting. Worker-only (RLS on, admin read; the web role holds no write grant).
 */
export const pointsExpiryWarnings = pgTable(
  "points_expiry_warnings",
  {
    id: id(),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** The nominal expiry date the warning was for (last approved visit + the shop's expiry months). */
    expiresAt: tz().notNull(),
    daysBefore: smallint().notNull(),
    sentAt: tz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("points_expiry_warnings_once_uq").on(t.membershipId, t.expiresAt, t.daysBefore),
    check("points_expiry_warnings_days", sql`${t.daysBefore} IN (30, 7)`),
  ],
);
