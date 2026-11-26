/**
 * P1-11 points requests (PRODUCT §5, §19). A customer asks the shop for gold; staff approve or reject it (P1-12).
 * One open request (`pending` or `awaiting_owner`) per membership (partial unique index), a unique idempotency
 * key per request, and `requested_at` = the server's receipt time (the database stamps it; the client's own
 * time is kept as advisory only and never used for multipliers or expiry). Open requests expire 24 h after
 * `requested_at`; `cancelled` is a member leaving the shop with a request open (DECISIONS 25 Nov).
 * Writes: the member inserts and cancels their own (RLS + guard, migration 0028); jobs expire and remind.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { REJECT_REASONS } from "@/lib/requests";
import { id, timestamps, tz } from "./_columns";
import { users } from "./auth";
import { memberships, shops } from "./core";

export const POINT_REQUEST_STATUSES = [
  "pending",
  "awaiting_owner",
  "approved",
  "rejected",
  "expired",
  "cancelled",
] as const;
export type PointRequestStatus = (typeof POINT_REQUEST_STATUSES)[number];

/** Open = still waiting for a decision (one per membership at a time). */
export const OPEN_REQUEST_STATUSES = ["pending", "awaiting_owner"] as const;

export const pointRequestStatus = pgEnum("point_request_status", POINT_REQUEST_STATUSES);

/** P1-12: preset reject reasons and request limits live in `@/lib/requests` (the forms use them too). */
export { REJECT_NOTE_MAX, REJECT_REASONS, type RejectReason, REQUEST_ITEMS } from "@/lib/requests";
export const pointRequestRejectReason = pgEnum("point_request_reject_reason", REJECT_REASONS);

/** `request`: the customer's tap (P1-11); `scan`: staff scanned the member QR (P1-14, already approved). */
export const pointRequestSource = pgEnum("point_request_source", ["request", "scan"]);

export const pointRequests = pgTable(
  "point_requests",
  {
    id: id(),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    /** The membership's user and shop, copied so the policies and the shop's queue need no join. */
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shopId: uuid()
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    status: pointRequestStatus().notNull().default("pending"),
    /** The client's key for this tap: a retry (double tap, offline queue) sends the same one. */
    idempotencyKey: uuid().notNull(),
    /** Server receipt time: the database's now() on insert (guard, 0028). */
    requestedAt: tz().notNull().defaultNow(),
    /** What the phone's clock said when the customer tapped. Advisory only: never used for rules. */
    clientRequestedAt: tz(),
    /** When the request left the open states (approved, rejected, expired, cancelled). */
    decidedAt: tz(),
    /** When the shop was reminded of it (once, after 30 min pending). */
    remindedAt: tz(),
    /** P1-12: the team member who approved or rejected it (null while open, and for expiry/cancel). */
    decidedBy: uuid(),
    /** P1-12: amount spent (pence) and items, from the approve form; kept when routed to the owner. */
    amountPence: integer(),
    items: jsonb().$type<string[]>(),
    /** P1-12: the gold the award came to (engine), set when routed to the owner or approved. */
    awardGold: integer(),
    rejectReason: pointRequestRejectReason(),
    rejectNote: text(),
    /** P1-12: a staff member's over-limit approval sent it to the owner (`awaiting_owner`). */
    routedBy: uuid(),
    routedAt: tz(),
    source: pointRequestSource().notNull().default("request"),
    /**
     * P1-15: the ingot before and after this approval (gold in the ingot being filled, and that ingot's size), so
     * the customer's celebration pours from the old level to the new one. Set with `approved` only (guard, 0033).
     */
    progressBefore: integer(),
    progressAfter: integer(),
    ingotSize: integer(),
    /** P1-15: when the customer's app claimed this approval's celebration (once: never shown twice). */
    seenAt: tz(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("point_requests_idempotency_key_uq").on(t.idempotencyKey),
    uniqueIndex("point_requests_one_open_uq")
      .on(t.membershipId)
      .where(sql`${t.status} IN ('pending', 'awaiting_owner')`),
    index("point_requests_membership_requested_idx").on(t.membershipId, t.requestedAt),
    index("point_requests_shop_requested_idx").on(t.shopId, t.requestedAt.desc()),
    index("point_requests_user_id_idx").on(t.userId),
    index("point_requests_open_requested_idx")
      .on(t.requestedAt)
      .where(sql`${t.status} IN ('pending', 'awaiting_owner')`),
    index("point_requests_unseen_idx")
      .on(t.userId, t.decidedAt.desc())
      .where(sql`${t.status} = 'approved' AND ${t.seenAt} IS NULL`),
    check(
      "point_requests_celebration_shape",
      sql`(${t.progressBefore} IS NULL) = (${t.progressAfter} IS NULL) AND (${t.progressBefore} IS NULL) = (${t.ingotSize} IS NULL)
        AND (${t.ingotSize} IS NULL OR (${t.ingotSize} > 0 AND ${t.progressBefore} >= 0 AND ${t.progressAfter} >= 0))`,
    ),
    check("point_requests_amount_positive", sql`${t.amountPence} IS NULL OR ${t.amountPence} > 0`),
    check("point_requests_award_gold_positive", sql`${t.awardGold} IS NULL OR ${t.awardGold} > 0`),
    check(
      "point_requests_items_shape",
      sql`${t.items} IS NULL OR (jsonb_typeof(${t.items}) = 'array' AND jsonb_array_length(${t.items}) <= 10)`,
    ),
    check(
      "point_requests_reject_note_length",
      sql`${t.rejectNote} IS NULL OR char_length(${t.rejectNote}) <= 200`,
    ),
    check(
      "point_requests_rejected_has_reason",
      sql`(${t.status} = 'rejected') = (${t.rejectReason} IS NOT NULL)`,
    ),
    check(
      "point_requests_decided_when_closed",
      sql`(${t.status} IN ('pending', 'awaiting_owner')) = (${t.decidedAt} IS NULL)`,
    ),
  ],
);
