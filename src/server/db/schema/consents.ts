/**
 * P1-04: marketing consent history (COMPLIANCE §3: who, when, how, wording version), one row per answer or
 * change, append-only. No foreign keys, like `audit_logs`: the rows are the evidence and outlive the
 * membership and user they describe (pseudonymous after erasure). A BEFORE INSERT trigger (0020) copies
 * `user_id` / `shop_id` from the membership and stamps `created_at`, so they can't disagree with it, and a
 * deferred trigger on `memberships` refuses a `marketing_opt_in` value without a matching row from the same
 * transaction. Write only through `recordConsentChange` (src/server/repos/consents.ts).
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, tz } from "./_columns";

export const consentSource = pgEnum("consent_source", ["join", "rejoin", "settings", "leave"]);

export const marketingConsents = pgTable(
  "marketing_consents",
  {
    id: id(),
    membershipId: uuid().notNull(),
    /** Filled from the membership by the insert trigger. */
    userId: uuid().notNull(),
    shopId: uuid().notNull(),
    optedIn: boolean().notNull(),
    source: consentSource().notNull(),
    /** Version of the consent wording shown (src/features/join/consent.ts). */
    wordingVersion: text().notNull(),
    /** SHA-256 (hex) of the exact text the server rendered, shop name included. */
    wordingHash: text().notNull(),
    /** Who made the change (the customer; a system job for leave/erasure). */
    actorId: uuid(),
    createdAt: tz().notNull().defaultNow(),
  },
  (t) => [
    index("marketing_consents_membership_idx").on(t.membershipId, t.createdAt),
    index("marketing_consents_user_idx").on(t.userId),
    index("marketing_consents_shop_idx").on(t.shopId),
    check("marketing_consents_wording_hash", sql`${t.wordingHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "marketing_consents_wording_version",
      sql`char_length(${t.wordingVersion}) BETWEEN 1 AND 32`,
    ),
  ],
);
