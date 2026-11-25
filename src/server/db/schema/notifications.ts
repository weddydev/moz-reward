/**
 * P1-10 in-app notifications (ARCHITECTURE §4, §7). Partitioned monthly by `created_at` (migration 0027; Drizzle
 * does not model partitioning, so the SQL is hand-edited and the primary key is `(id, created_at)`).
 * `payload` holds ids, dates and enums only (built per type in src/server/notifications/types.ts), never
 * personal data. Written only by `notify()` in the producing transaction; the recipient reads their own rows
 * and may only set `read_at` (column grant). Retention drops whole partitions (P2-12, 12 months).
 */
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { tz } from "./_columns";
import { users } from "./auth";
import { shops } from "./core";

export const NOTIFICATION_CATEGORIES = ["transactional", "marketing"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid().references(() => shops.id, { onDelete: "cascade" }),
    type: text().notNull(),
    category: text({ enum: NOTIFICATION_CATEGORIES }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    readAt: tz(),
    createdAt: tz().defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.createdAt] }),
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    check("notifications_type_format", sql`${t.type} ~ '^[a-z][a-z_]{2,39}$'`),
    check("notifications_category", sql`${t.category} IN ('transactional', 'marketing')`),
    check(
      "notifications_payload_shape",
      sql`jsonb_typeof(${t.payload}) = 'object' AND pg_column_size(${t.payload}) <= 2048`,
    ),
  ],
);
