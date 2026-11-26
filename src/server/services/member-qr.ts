import "server-only";
import { createHash } from "node:crypto";
import { firstNameOf } from "@/features/wallet/view";
import { formatMemberId } from "@/lib/codes";
import type { CustomerScope, ShopScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { teamMemberByMemberId } from "@/server/repos/member-qr";
import { ownMemberCard } from "@/server/repos/profiles";
import {
  type MemberQrKeys,
  memberQrKeys,
  signMemberQr,
  verifyMemberQr,
} from "@/server/security/member-qr";

/**
 * Member QR (P1-14; PRODUCT §5 "Member QR scan", §18; SECURITY §6). `issueOwnMemberQr` gives the signed-in
 * customer a fresh 5-minute token for their card; `verifyMemberQrForShop` tells active staff whose card it is,
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
  | { status: "ok"; memberId: string; name: string }
  | { status: "not_member" }
  | { status: "expired" }
  | { status: "invalid" };

export async function verifyMemberQrForShop(
  scope: ShopScope,
  token: string,
  now: number,
  keys: MemberQrKeys = memberQrKeys(),
): Promise<MemberQrVerify> {
  const check = verifyMemberQr(token, now, keys);
  let result: MemberQrVerify;
  if (!check.ok) {
    result = { status: check.reason };
  } else {
    const member = await teamMemberByMemberId(scope, check.memberId);
    result = member
      ? { status: "ok", memberId: formatMemberId(member.memberId), name: member.name }
      : { status: "not_member" };
  }
  // Outcome and shop only: never the token, the member ID or the name (design check L8).
  log().info({ shopId: scope.shopId, outcome: result.status }, "member qr verified");
  return result;
}
