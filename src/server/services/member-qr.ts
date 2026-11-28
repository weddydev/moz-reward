import "server-only";
import { createHash } from "node:crypto";
import { firstNameOf } from "@/features/wallet/view";
import type { MemberId } from "@/lib/brand";
import { formatMemberId, normaliseMemberId } from "@/lib/codes";
import type { CustomerScope, ShopScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { scanMemberCard } from "@/server/repos/member-qr";
import { ownMemberCard } from "@/server/repos/profiles";
import {
  type MemberQrKeys,
  memberQrKeys,
  signMemberQr,
  verifyMemberQr,
} from "@/server/security/member-qr";

/**
 * Member QR (P1-14; PRODUCT §5 "Member QR scan", §18; SECURITY §6). `issueOwnMemberQr` gives the signed-in
 * customer a fresh 5-minute token for their card; `verifyMemberForShop` tells active staff whose card it is,
 * only for a current member of their own shop. The verify result is never a trust anchor: the P2 award takes
 * the token again and re-verifies it with the same membership check (design check M5).
 */

/** How long the phone may keep the card payload for offline use (design check H1): a day, then it's dropped. */
export const CARD_CACHE_MS = 24 * 60 * 60_000;

export type MemberQrPayload = {
  token: string;
  /** Formatted `XXX-XXX`. */
  memberId: string;
  /** First name only: the payload is cached on the phone for the offline card (design check H1). */
  firstName: string;
  serverNow: number;
  expiresAt: number;
  /** After this (server clock) the phone drops the cached payload. */
  cacheUntil: number;
  /** Whose card this is, one-way: a page signed in as someone else (or signed out) drops the cached copy. */
  owner: string;
};

/** One-way tag of the account a cached card belongs to (not a secret: it only has to differ per account). */
export const cardOwnerTag = (userId: string): string =>
  createHash("sha256").update(`moz:card-owner:v1:${userId}`).digest("base64url").slice(0, 22);

export async function issueOwnMemberQr(
  scope: CustomerScope,
  now: number,
  keys: MemberQrKeys = memberQrKeys(),
): Promise<MemberQrPayload | null> {
  const card = await ownMemberCard(scope);
  if (!card) return null;
  const { token, expiresAt } = signMemberQr(card.memberId, now, keys);
  return {
    token,
    memberId: formatMemberId(card.memberId),
    firstName: firstNameOf(card.fullName) ?? "",
    serverNow: now,
    expiresAt,
    cacheUntil: now + CARD_CACHE_MS,
    owner: cardOwnerTag(scope.userId),
  };
}

export type MemberQrVerify =
  | {
      status: "ok";
      /** Formatted `XXX-XXX`. */
      memberId: string;
      name: string;
      /** For the award panel (P2-02): the Requests page's own fields about this shop's member. */
      purchaseCount: number;
      lastVisitIso: string | null;
      streak: { weeks: number; lastWeekStart: string | null };
      /** A request of theirs already waiting here: the scanner offers to approve that one instead. */
      openRequest: { id: string; awaitingOwner: boolean } | null;
    }
  /** The caller's own card: no award is possible (self-award ban, PRODUCT §5), so nothing more is shown. */
  | { status: "self" }
  | { status: "not_member" }
  | { status: "expired" }
  | { status: "invalid" };

/** The scanned token, or the member ID typed from an offline card (PRODUCT §18). */
export type MemberRef = { token: string } | { memberId: string };

/**
 * Whose card a scanned token or a typed member ID is, for the shop's active team (P1-14; P2-02 adds the typed ID
 * and the award panel's fields). Only a current member of the caller's own shop gets an answer beyond
 * `not_member`; another shop's member, a former member and an unknown ID look the same. The award verifies again
 * (`scanAward`, design check M5): this result is display only.
 */
export async function verifyMemberForShop(
  scope: ShopScope,
  ref: MemberRef,
  now: number,
  keys: MemberQrKeys = memberQrKeys(),
): Promise<MemberQrVerify> {
  const via = "token" in ref ? "qr" : "member_id";
  let memberId: MemberId | null;
  let result: MemberQrVerify | null = null;
  if ("token" in ref) {
    const check = verifyMemberQr(ref.token, now, keys);
    memberId = check.ok ? check.memberId : null;
    if (!check.ok) result = { status: check.reason };
  } else {
    memberId = normaliseMemberId(ref.memberId);
    if (!memberId) result = { status: "invalid" };
  }
  if (memberId) {
    const member = await scanMemberCard(scope, memberId);
    result = !member
      ? { status: "not_member" }
      : member.userId === scope.userId
        ? { status: "self" }
        : {
            status: "ok",
            memberId: formatMemberId(member.memberId),
            name: member.name,
            purchaseCount: member.purchaseCount,
            lastVisitIso: member.lastVisitAt?.toISOString() ?? null,
            streak: member.streak,
            openRequest: member.openRequest,
          };
  }
  const outcome = result ?? { status: "invalid" as const };
  // Outcome, path and shop only: never the token, the member ID or the name (design check L8).
  log().info({ shopId: scope.shopId, via, outcome: outcome.status }, "member qr verified");
  return outcome;
}
