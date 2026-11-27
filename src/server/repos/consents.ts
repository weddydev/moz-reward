import "server-only";
import { createHash } from "node:crypto";
import { MARKETING_CONSENT_VERSION, marketingConsentText } from "@/lib/marketing-consent";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { marketingConsents } from "@/server/db/schema";
import { withScope } from "./_base";

export type ConsentSource = (typeof marketingConsents.$inferInsert)["source"];

/**
 * The one way a marketing consent answer is recorded (COMPLIANCE §3: who, when, how, wording version). Must run
 * in the same transaction as the `memberships.marketing_opt_in` write: the deferred trigger from 0020 refuses
 * the commit otherwise. `user_id`, `shop_id` and `created_at` are filled by the database from the membership.
 */
export async function recordConsentChange(
  scope: CustomerScope,
  input: {
    membershipId: string;
    shopId: string;
    optedIn: boolean;
    source: ConsentSource;
    shopName: string;
  },
  tx: Transaction,
): Promise<void> {
  const wordingHash = createHash("sha256")
    .update(marketingConsentText(input.shopName), "utf8")
    .digest("hex");
  await withScope(
    scope,
    (q) =>
      q.insert(marketingConsents).values({
        membershipId: input.membershipId,
        // The BEFORE INSERT trigger overwrites both from the membership (they can't disagree with it).
        userId: scope.userId,
        shopId: input.shopId,
        optedIn: input.optedIn,
        source: input.source,
        wordingVersion: MARKETING_CONSENT_VERSION,
        wordingHash,
        actorId: scope.userId,
      }),
    tx,
  );
}
