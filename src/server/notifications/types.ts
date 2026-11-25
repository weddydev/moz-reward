import "server-only";
import { z } from "zod";
import type { NotificationCategory } from "@/server/db/schema/notifications";

/**
 * Notification types (P1-10). Each type fixes its category, its channels and its payload schema (ids, dates and
 * enums only: a strict object, so personal data can't ride along). Later tasks add their types here; P3-07 adds
 * push, preferences and the inbox behind the same `notify()` interface.
 *
 * Email is only for the events on the email budget list (ARCHITECTURE §10): a type can name email only with one
 * of these budget kinds, and `defineNotificationType` refuses anything else at start-up. Every P1 customer event
 * (request expired, reversal, expiry warnings, programme change) is in-app only. Marketing notifications are
 * refused until the consent gate exists (P3-07, COMPLIANCE §3).
 */
export const EMAIL_BUDGET = [
  "sign_in_link",
  "staff_invite",
  "plan_reminder",
  "data_request",
  "weekly_owner_email",
  "security_notice",
] as const;
export type EmailBudgetKind = (typeof EMAIL_BUDGET)[number];

export type NotificationTypeDef<S extends z.ZodType = z.ZodType> = {
  category: NotificationCategory;
  /** The budget-list entry this type's email counts against, or null for in-app only. */
  email: EmailBudgetKind | null;
  payload: S;
};

export function defineNotificationType<S extends z.ZodType>(def: {
  category: NotificationCategory;
  email?: EmailBudgetKind | null;
  payload: S;
}): NotificationTypeDef<S> {
  const email = def.email ?? null;
  if (email !== null && !(EMAIL_BUDGET as readonly string[]).includes(email)) {
    throw new Error(
      `Notification email "${email}" is not on the email budget list (ARCHITECTURE §10)`,
    );
  }
  if (def.category === "marketing") {
    throw new Error(
      "Marketing notifications need the consent gate (P3-07); none may be defined yet",
    );
  }
  return { category: def.category, email, payload: def.payload };
}

const id = z.uuid();

export const NOTIFICATION_TYPES = {
  /**
   * C-58 (PRODUCT §6): a shop changed its rewards or milestones; the new ones apply from `rewardsFrom` (14 days'
   * notice). One per member per programme version.
   */
  loyalty_change_notice: defineNotificationType({
    category: "transactional",
    payload: z
      .object({ shopId: id, version: z.number().int().min(1), rewardsFrom: z.iso.datetime() })
      .strict(),
  }),
  /** P1-11 (PRODUCT §19): the customer's points request ran out after 24 h without a decision. */
  request_expired: defineNotificationType({
    category: "transactional",
    payload: z.object({ shopId: id, requestId: id, requestedAt: z.iso.datetime() }).strict(),
  }),
  /** P1-11: to the shop's team, once, when a request has waited 30 min (PRODUCT §19 "shop reminder"). */
  request_reminder: defineNotificationType({
    category: "transactional",
    payload: z.object({ shopId: id, requestId: id, requestedAt: z.iso.datetime() }).strict(),
  }),
} as const satisfies Record<string, NotificationTypeDef>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationPayload<T extends NotificationType> = z.input<
  (typeof NOTIFICATION_TYPES)[T]["payload"]
>;
