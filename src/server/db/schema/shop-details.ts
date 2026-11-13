/**
 * P1-01 shop details: opening hours, special closures and NFC tags (ARCHITECTURE §4, PRODUCT §3, §14).
 * Open/closed status is computed from these by `src/lib/open-status.ts` (Europe/London).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_columns";
import { shops } from "./core";

/** One opening window. `closes <= opens` runs past midnight; `24:00` is the end of the day. */
export const shopHours = pgTable(
  "shop_hours",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** ISO weekday: 1 = Monday … 7 = Sunday. */
    weekday: smallint().notNull(),
    opens: time().notNull(),
    closes: time().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("shop_hours_shop_weekday_opens_uq").on(t.shopId, t.weekday, t.opens),
    check("shop_hours_weekday_iso", sql`${t.weekday} BETWEEN 1 AND 7`),
    check("shop_hours_not_empty", sql`${t.opens} <> ${t.closes}`),
    check("shop_hours_opens_in_day", sql`${t.opens} < '24:00'`),
  ],
);

/** A day the shop is closed whatever its hours say (bank holiday, refit). */
export const shopClosures = pgTable(
  "shop_closures",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    date: date({ mode: "string" }).notNull(),
    note: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("shop_closures_shop_date_uq").on(t.shopId, t.date),
    check("shop_closures_note_length", sql`char_length(${t.note}) <= 120`),
  ],
);

export const nfcTagStatus = pgEnum("nfc_tag_status", [
  "active",
  "replacement_requested",
  "replacement_sent",
  "replaced",
]);

/**
 * A physical NFC tag at the counter. Every tag of a shop carries the same NDEF URL (`/s/<code>?src=nfc`); the
 * row tracks the hardware tag for the QR & NFC kit. A replaced tag points straight at the shop's current tag
 * (never a chain): enforced by the `nfc_tags_one_hop` constraint trigger (drizzle/0015).
 */
export const nfcTags = pgTable(
  "nfc_tags",
  {
    id: id(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    /** Hardware UID, upper-case hex: 4, 7 or 10 bytes. */
    tagUid: text().notNull(),
    status: nfcTagStatus().notNull().default("active"),
    replacedBy: uuid().references((): AnyPgColumn => nfcTags.id, { onDelete: "restrict" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("nfc_tags_tag_uid_uq").on(t.tagUid),
    index("nfc_tags_shop_id_idx").on(t.shopId),
    index("nfc_tags_replaced_by_idx").on(t.replacedBy),
    check(
      "nfc_tags_tag_uid_format",
      sql`${t.tagUid} ~ '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$'`,
    ),
    check(
      "nfc_tags_replaced_iff_pointer",
      sql`(${t.status} = 'replaced') = (${t.replacedBy} IS NOT NULL)`,
    ),
    check("nfc_tags_not_self", sql`${t.replacedBy} <> ${t.id}`),
  ],
);
