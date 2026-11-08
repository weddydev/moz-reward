/**
 * P0 domain tables: customer profiles, shops, staff, admin team, memberships, audit log, feature flags.
 * Data model: docs/ARCHITECTURE.md §4. Later phases add their tables in sibling files.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  geometry,
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
import { id, timestamps, tz } from "./_columns";
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

/** Customer-side profile (1:1 with users). Phone stored encrypted + HMAC blind index. */
export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: uuid()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text().notNull(),
    phoneEnc: text(),
    phoneHash: text(),
    birthdayDay: smallint(),
    birthdayMonth: smallint(),
    memberId: text().notNull().unique(),
    soundOn: boolean().notNull().default(true),
    /** null = follow the system setting (prefers-reduced-motion). */
    reduceMotion: boolean(),
    isAdultConfirmed: boolean().notNull().default(false),
    adultConfirmedAt: tz(),
    ...timestamps(),
  },
  (t) => [
    index("customer_profiles_phone_hash_idx").on(t.phoneHash),
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
    id: id(),
    slug: text().notNull().unique(),
    shopCode: text().notNull().unique(),
    name: text().notNull(),
    tradingName: text(),
    category: text().notNull(),
    description: text(),
    addressLine1: text(),
    addressLine2: text(),
    town: text(),
    postcode: text(),
    location: geometry({ type: "point", mode: "xy", srid: 4326 }),
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
    check(
      "shop_staff_per_award_limit_positive",
      sql`${t.perAwardLimit} IS NULL OR ${t.perAwardLimit} > 0`,
    ),
  ],
);

/** Platform team. One row per admin user; deny by default when absent or inactive. */
export const adminMembers = pgTable("admin_members", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  role: adminRole().notNull(),
  active: boolean().notNull().default(true),
  invitedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  ...timestamps(),
});

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
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("memberships_user_shop_uq").on(t.userId, t.shopId),
    index("memberships_shop_id_idx").on(t.shopId),
    check("memberships_purchase_count_non_negative", sql`${t.purchaseCount} >= 0`),
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

export const featureFlags = pgTable("feature_flags", {
  key: text().primaryKey(),
  enabled: boolean().notNull().default(false),
  description: text(),
  updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
  ...timestamps(),
});
