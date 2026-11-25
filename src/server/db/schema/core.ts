/**
 * P0 domain tables: customer profiles, shops, staff, admin team, memberships, audit log, feature flags.
 * Data model: docs/ARCHITECTURE.md §4. Later phases add their tables in sibling files.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
import type { MemberId, ShopCode, ShopId } from "@/lib/brand";
import { geographyPoint, id, timestamps, tz } from "./_columns";
import { users } from "./auth";

export const shopStatus = pgEnum("shop_status", [
  "pending",
  "active",
  "expiring",
  "grace",
  "restricted",
  "suspended",
  "closed",
]);
export const shopStaffRole = pgEnum("shop_staff_role", ["owner", "staff"]);
export const adminRole = pgEnum("admin_role", ["owner", "support", "moderator", "finance"]);

/**
 * Customer-side profile (1:1 with users). Phone stored encrypted (`phone_enc` sealed under `phone_key_id`,
 * src/server/security/field-crypto.ts) + HMAC blind index (`phone_hash`, never unique: no "number in use"
 * oracle). Guard trigger 0020: member_id, user_id, created_at and age_declared_at never change, and a
 * customer can't set the 18+ columns.
 */
export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text().notNull(),
    phoneEnc: text(),
    /** Id of the data key that sealed `phone_enc` (rotation, `pnpm keys:reencrypt`). */
    phoneKeyId: text(),
    phoneHash: text(),
    birthdayDay: smallint(),
    birthdayMonth: smallint(),
    memberId: text().$type<MemberId>().notNull().unique(),
    /** null = no choice yet (sounds are on by default, DESIGN §9). */
    soundOn: boolean(),
    /** null = follow the system setting (prefers-reduced-motion). */
    reduceMotion: boolean(),
    isAdultConfirmed: boolean().notNull().default(false),
    adultConfirmedAt: tz(),
    /** When the "I am 13 or over" box was ticked (COMPLIANCE §7); set once, on profile creation (P1-04). */
    ageDeclaredAt: tz(),
    ...timestamps(),
  },
  (t) => [
    index("customer_profiles_phone_hash_idx").on(t.phoneHash),
    check(
      "customer_profiles_phone_sealed",
      sql`(${t.phoneEnc} IS NULL) = (${t.phoneKeyId} IS NULL) AND (${t.phoneEnc} IS NULL) = (${t.phoneHash} IS NULL)`,
    ),
    check("customer_profiles_full_name_length", sql`char_length(${t.fullName}) BETWEEN 1 AND 80`),
    check("customer_profiles_member_id_format", sql`${t.memberId} ~ '^[2-9A-HJKMNP-TV-Z]{6}$'`),
    check(
      "customer_profiles_birthday_valid",
      sql`(${t.birthdayDay} IS NULL AND ${t.birthdayMonth} IS NULL) OR (${t.birthdayDay} BETWEEN 1 AND 31 AND ${t.birthdayMonth} BETWEEN 1 AND 12)`,
    ),
  ],
);

export const shops = pgTable(
  "shops",
  {
    id: id().$type<ShopId>(),
    slug: text().notNull().unique(),
    shopCode: text().$type<ShopCode>().notNull().unique(),
    name: text().notNull(),
    tradingName: text(),
    category: text().notNull(),
    description: text(),
    addressLine1: text(),
    addressLine2: text(),
    town: text(),
    postcode: text(),
    location: geographyPoint(),
    googlePlaceId: text(),
    phone: text(),
    logoUrl: text(),
    coverUrl: text(),
    vatNumber: text(),
    status: shopStatus().notNull().default("pending"),
    ...timestamps(),
  },
  (t) => [
    index("shops_location_gist").using("gist", t.location),
    index("shops_status_idx").on(t.status),
    check("shops_shop_code_format", sql`${t.shopCode} ~ '^[2-9A-HJKMNP-TV-Z]{6}$'`),
    // P1-01: the Call button dials this (src/lib/shop-links.ts). Added NOT VALID in 0015 (locking rules).
    check("shops_phone_e164", sql`${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
  ],
);

export const shopStaff = pgTable(
  "shop_staff",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: shopStaffRole().notNull().default("staff"),
    /** Max gold one award may carry without owner approval; null = no limit (owners). */
    perAwardLimit: integer(),
    active: boolean().notNull().default(true),
    invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("shop_staff_shop_user_uq").on(t.shopId, t.userId),
    index("shop_staff_user_id_idx").on(t.userId),
    index("shop_staff_invited_by_idx").on(t.invitedBy),
    check(
      "shop_staff_per_award_limit_positive",
      sql`${t.perAwardLimit} IS NULL OR ${t.perAwardLimit} > 0`,
    ),
  ],
);

/** Platform team. One row per admin user; deny by default when absent or inactive. */
export const adminMembers = pgTable(
  "admin_members",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    role: adminRole().notNull(),
    active: boolean().notNull().default(true),
    invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("admin_members_invited_by_idx").on(t.invitedBy)],
);

/** Status label from lifetime ingots (engine `TIERS`); the membership keeps the highest reached. */
export const membershipTier = pgEnum("membership_tier", ["bronze", "silver", "gold"]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    joinedAt: tz().notNull().defaultNow(),
    muted: boolean().notNull().default(false),
    /** null = not asked yet; the join flow asks clearly (PECR). */
    marketingOptIn: boolean(),
    leftAt: tz(),
    purchaseCount: integer().notNull().default(0),
    lastVisitAt: tz(),
    /**
     * P1-07: gold in the current ingot and ingots filled so far (the Wallet reads them; P1-12 approvals write
     * them with the ledger). Server-owned: the web role can't set them (memberships guard, 0025).
     */
    progressGold: integer().notNull().default(0),
    ingotsCompleted: integer().notNull().default(0),
    /**
     * P1-12 (C-60, C-66; engine `MemberState`): the rest of the loyalty state, written by approvals with the
     * ledger. `ingotStartedAt` null = the current ingot started at `joinedAt` (no backfill in a migration,
     * ENGINEERING §6). `tier` is the highest reached (never lowered); the streak is the engine's `StreakState`.
     */
    ingotStartedAt: tz(),
    milestonesReached: smallint()
      .array()
      .notNull()
      .default(sql`'{}'::smallint[]`),
    goldShortfall: integer().notNull().default(0),
    tier: membershipTier().notNull().default("bronze"),
    streakWeeks: integer().notNull().default(0),
    streakLastWeekStart: date({ mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("memberships_user_shop_uq").on(t.userId, t.shopId),
    index("memberships_shop_id_idx").on(t.shopId),
    check("memberships_purchase_count_non_negative", sql`${t.purchaseCount} >= 0`),
    check("memberships_progress_gold_non_negative", sql`${t.progressGold} >= 0`),
    check("memberships_ingots_completed_non_negative", sql`${t.ingotsCompleted} >= 0`),
    check("memberships_gold_shortfall_non_negative", sql`${t.goldShortfall} >= 0`),
    check("memberships_streak_weeks_non_negative", sql`${t.streakWeeks} >= 0`),
  ],
);

/** Append-only (UPDATE/DELETE blocked by trigger). No FKs so rows survive user deletion. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: uuid(),
    actorRole: text().notNull(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text(),
    at: tz().notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId, t.at),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
    index("audit_logs_action_idx").on(t.action, t.at),
  ],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text().primaryKey(),
    enabled: boolean().notNull().default(false),
    description: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("feature_flags_updated_by_idx").on(t.updatedBy)],
);

/**
 * Admin-editable content (ARCHITECTURE §4: feedback chips, keywords, templates, shop categories).
 * One JSON document per key; each consumer validates its value with its own Zod schema on read.
 */
export const contentSettings = pgTable(
  "content_settings",
  {
    key: text().primaryKey(),
    value: jsonb().$type<unknown>().notNull(),
    description: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("content_settings_updated_by_idx").on(t.updatedBy),
    check("content_settings_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,62}$'`),
  ],
);
