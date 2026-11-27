import "server-only";
import type { MemberId } from "@/lib/brand";
import { MARKETING_CONSENT_VERSION } from "@/lib/marketing-consent";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { recordConsentChange } from "@/server/repos/consents";
import { joinOwnMembership } from "@/server/repos/memberships";
import { createOwnProfile, type NewProfile, ownMemberId } from "@/server/repos/profiles";
import { findJoinableShop } from "@/server/repos/shops";

export type JoinInput = {
  shopCode: string;
  marketingOptIn: boolean;
  /** The consent wording version the customer saw; anything but the current one is refused. */
  consentVersion: string;
  /** The shop name the question showed ("Get offers and news from <name>?"); the stored hash is of the text
   *  the server renders now, so an answer given to an older name (renamed inside the 60 s landing cache, or a
   *  sheet open since before the rename) is refused like an outdated version. */
  consentShopName: string;
  /** Required when the caller has no profile yet; ignored (never overwrites) when they have one. */
  profile: NewProfile | null;
};

export type JoinResult = {
  shopId: string;
  membershipId: string;
  memberId: MemberId;
  /** True when this call created or re-opened the membership (first-join welcome on the shop page). */
  firstJoin: boolean;
};

/** Shown when the shop exists but isn't taking members (suspended, closed). */
export const SHOP_NOT_JOINABLE = "This shop isn't taking new members on Moz Rewards right now.";
export const CONSENT_OUTDATED =
  "The wording of this question has just changed. Please read it again and choose.";
export const PROFILE_REQUIRED = "Please complete your profile to join.";

/**
 * "Collect points" → join (PRODUCT §3, P1-04). In the caller's transaction: profile (if missing) → membership
 * (idempotent) → consent record for a new or re-opened membership. Re-scanning a joined shop changes nothing
 * and writes no consent row. Restricted plans can still be joined (PRODUCT §15).
 */
export async function joinShop(
  scope: CustomerScope,
  input: JoinInput,
  tx: Transaction,
): Promise<JoinResult> {
  if (input.consentVersion !== MARKETING_CONSENT_VERSION)
    throw new AppError("CONFLICT", CONSENT_OUTDATED);
  const shop = await findJoinableShop(scope, input.shopCode, tx);
  if (shop.kind === "none") throw new AppError("NOT_FOUND", "We couldn't find that shop.");
  if (shop.kind === "gone") throw new AppError("FORBIDDEN", SHOP_NOT_JOINABLE);
  if (input.consentShopName !== shop.name) throw new AppError("CONFLICT", CONSENT_OUTDATED);

  let memberId = await ownMemberId(scope, tx);
  if (!memberId) {
    if (!input.profile) throw new AppError("VALIDATION", PROFILE_REQUIRED);
    memberId = (await createOwnProfile(scope, input.profile, tx)).memberId;
  }

  const outcome = await joinOwnMembership(
    scope,
    { shopId: shop.id, marketingOptIn: input.marketingOptIn },
    tx,
  );
  if (outcome.kind !== "member") {
    await recordConsentChange(
      scope,
      {
        membershipId: outcome.membershipId,
        shopId: shop.id,
        optedIn: input.marketingOptIn,
        source: outcome.kind === "joined" ? "join" : "rejoin",
        shopName: shop.name,
      },
      tx,
    );
  }
  return {
    shopId: shop.id,
    membershipId: outcome.membershipId,
    memberId,
    firstJoin: outcome.kind !== "member",
  };
}
