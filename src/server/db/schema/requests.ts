/**
 * P1-11 points requests (PRODUCT §5, §19). A customer asks the shop for gold; staff approve or reject it (P1-12).
 * One open request (`pending` or `awaiting_owner`) per membership (partial unique index), a unique idempotency
 * key per request, and `requested_at` = the server's receipt time (the database stamps it; the client's own
 * time is kept as advisory only and never used for multipliers or expiry). Open requests expire 24 h after
 * `requested_at`; `cancelled` is a member leaving the shop with a request open (DECISIONS 25 Nov).
 * Writes: the member inserts and cancels their own (RLS + guard, migration 0028); jobs expire and remind.
 */
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    check(
      "point_requests_decided_when_closed",
      sql`(${t.status} IN ('pending', 'awaiting_owner')) = (${t.decidedAt} IS NULL)`,
    ),
  ],
);
