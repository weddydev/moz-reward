import "server-only";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { recordConsentChange } from "@/server/repos/consents";
import { leaveOwnMembership, setOwnMembershipMuted } from "@/server/repos/memberships";

/** Shown when the caller isn't a current member of the shop (never joined, left, or no such shop). */
export const NOT_A_MEMBER = "You're not a member of this shop.";

/**
 * "Leave shop" (PRODUCT §4, P1-09): allowed any time, no minimum membership. In the caller's transaction:
 * the membership is closed (progress frozen, ledger kept, shop hidden) and marketing consent is withdrawn with
 * a 'leave' consent row (C-54). Idempotent: leaving a shop already left changes nothing (`left: false`).
 *
 * Everything else that must end with the membership joins this transaction as its table arrives (CARRIED in
 * PROGRESS): open points requests cancelled (P1-11), live redeem codes voided while the rewards themselves
 * stay (P1-16), live offer claim codes voided (P3-06).
 */
export async function leaveShop(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<{ left: boolean }> {
  const outcome = await leaveOwnMembership(scope, shopId, tx);
  if (outcome.kind === "not-member") throw new AppError("NOT_FOUND", NOT_A_MEMBER);
  if (outcome.kind === "already-left") return { left: false };
  if (outcome.withdrewMarketing) {
    await recordConsentChange(
      scope,
      {
        membershipId: outcome.membershipId,
        shopId,
        optedIn: false,
        source: "leave",
        shopName: outcome.shopName,
      },
      tx,
    );
  }
  return { left: true };
}

/** "Mute notifications" (P1-09): immediate, idempotent; current members only. */
export async function setShopMuted(
  scope: CustomerScope,
  shopId: string,
  muted: boolean,
  tx: Transaction,
): Promise<{ muted: boolean }> {
  if (!(await setOwnMembershipMuted(scope, shopId, muted, tx)))
    throw new AppError("NOT_FOUND", NOT_A_MEMBER);
  return { muted };
}
