import { formatDate } from "@/lib/format-date";
import { type EarnMode, versionActiveAt, type VersionDates } from "@/lib/loyalty/programme";
import type { MemberQrVerify } from "@/server/services/member-qr";
import type { QueueRow } from "../requests/view";

/**
 * The scanner's words and the award panel's row (P2-02). A scan award is a new request decided on the spot, so the
 * approve form gets a QueueRow made from the verify answer: "now" as the request time, the rules active now.
 */

export type VerifyFound = Extract<MemberQrVerify, { status: "ok" }>;
export type VerifyRefusal = Exclude<MemberQrVerify, { status: "ok" }>["status"];

export const SCAN_COPY = {
  shopQr:
    "That's your shop's QR. Ask the customer to open their member card: Me, then Member card.",
  otherQr: "That isn't a Moz Rewards member QR. Ask the customer to open their member card.",
  memberIdHint: "6 letters and numbers, on the customer's member card, like K7Q-42M.",
  memberIdInvalid: "Member IDs are 6 letters and numbers, like K7Q-42M.",
  offline: "You're offline. Awards need a connection, so scanning waits until you're back online.",
  denied:
    "The camera is blocked for this site. Allow it in your browser's site settings, or type the member ID below.",
  noCamera:
    "This device has no camera we can use. Type the member ID from the customer's card instead.",
  explainer:
    "Point the camera at the QR on the customer's member card. The picture stays on this device: only the code is checked.",
} as const;

/** Why a scan or a typed ID gives no award panel, in the team's words. Reveals nothing about non-members. */
export function refusalMessage(status: VerifyRefusal, via: "qr" | "member_id"): string {
  switch (status) {
    case "invalid":
      return via === "qr" ? SCAN_COPY.otherQr : SCAN_COPY.memberIdInvalid;
    case "expired":
      return "This member QR has expired. Ask the customer to refresh their card.";
    case "not_member":
      return "This customer isn't a member of your shop yet. Ask them to scan the shop QR first.";
    case "self":
      return "That's your own member card. Ask another team member to award your gold.";
    default: {
      const never: never = status;
      return String(never);
    }
  }
}

const visitsText = (n: number): string =>
  n === 0 ? "First visit" : n === 1 ? "1 visit" : `${n.toLocaleString("en-GB")} visits`;

/** The approve form's row for a scan award (no request exists yet: the id is a placeholder the form never sends). */
export function scanRow(
  found: VerifyFound,
  versions: readonly (VersionDates & { earnMode: EarnMode })[],
  now: Date,
): QueueRow {
  return {
    id: "scan",
    status: "pending",
    name: found.name,
    memberId: found.memberId,
    requestedAt: "Now",
    requestedIso: now.toISOString(),
    visits: visitsText(found.purchaseCount),
    lastVisit: found.lastVisitIso ? `Last visit ${formatDate(new Date(found.lastVisitIso))}` : null,
    amountRequired: versionActiveAt(versions, now)?.earnMode === "per_pound",
    proposal: null,
    canDecide: true,
    waiting: null,
  };
}
