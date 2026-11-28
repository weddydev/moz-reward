import "server-only";
import type { MemberId } from "@/lib/brand";
import { normaliseMemberId } from "@/lib/codes";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import { readOwnStaffRow } from "@/server/repos/approvals";
import {
  currentMemberByMemberId,
  insertScanRequest,
  openRequestOf,
  scanByKey,
} from "@/server/repos/scan-awards";
import { type MemberQrKeys, memberQrKeys, verifyMemberQr } from "@/server/security/member-qr";
import { type ApproveResult, approveRequest, NOT_ON_TEAM, SELF_AWARD } from "./approvals";

/**
 * Member-QR scan awards (P2-02, PRODUCT §5 "Member QR scan"): staff scan a customer's member QR, or type the member
 * ID from an offline card (PRODUCT §18), and award directly. The award is a `source = 'scan'` request inserted and
 * decided in one transaction through the P1-12 approve path, so the per-award limit (→ `awaiting_owner`), the
 * platform cap, the self-award ban and the receipt all apply unchanged, and 0038's guards check them again.
 *
 * The token is verified again here with the current-membership check (P1-14 design check M5): what the scanner's
 * verify showed is never trusted. Another shop's member, an unknown ID and a former member get one answer, so a
 * scan reveals nothing about a customer who isn't this shop's member.
 */

export const QR_INVALID =
  "This isn't a Moz Rewards member QR. Ask the customer to open their member card again.";
export const QR_EXPIRED = "This member QR has expired. Ask the customer to refresh their card.";
export const NOT_A_MEMBER =
  "This customer isn't a member of your shop yet. Ask them to scan the shop QR first.";
export const MEMBER_ID_INVALID = "Member IDs are 6 letters and numbers, like K7Q-42M.";

export type ScanAwardInput = {
  /** The scanned token, or the member ID typed from an offline card. */
  member: { token: string } | { memberId: string };
  /** The client's key for this award: a double tap or a retry sends the same one. */
  idempotencyKey: string;
  amountPence?: number | null | undefined;
  items?: readonly string[] | null | undefined;
};

export type ScanAwardResult =
  | ApproveResult
  /** This key's scan was recorded before (a retry): nothing new is written. */
  | { outcome: "already_recorded"; requestId: string }
  /** The member already has a request waiting: approve that one instead (one open request per member). */
  | { outcome: "open_request"; requestId: string };

function memberIdOf(member: ScanAwardInput["member"], now: number, keys: MemberQrKeys): MemberId {
  if ("token" in member) {
    const check = verifyMemberQr(member.token, now, keys);
    if (check.ok) return check.memberId;
    throw new AppError("VALIDATION", check.reason === "expired" ? QR_EXPIRED : QR_INVALID);
  }
  const id = normaliseMemberId(member.memberId);
  if (!id) throw new AppError("VALIDATION", MEMBER_ID_INVALID, { memberId: [MEMBER_ID_INVALID] });
  return id;
}

export async function scanAward(
  scope: ShopScope,
  input: ScanAwardInput,
  tx: Transaction,
  keys: MemberQrKeys = memberQrKeys(),
): Promise<ScanAwardResult> {
  const via = "token" in input.member ? "qr" : "member_id";
  const memberId = memberIdOf(input.member, Date.now(), keys);
  // Live team row first: a deactivated team member should hear why, not "not a member".
  const team = await readOwnStaffRow(scope, tx);
  if (!team?.active) throw new AppError("FORBIDDEN", NOT_ON_TEAM);

  const recorded = await scanByKey(scope, input.idempotencyKey, tx);
  if (recorded) return { outcome: "already_recorded", requestId: recorded };

  const member = await currentMemberByMemberId(scope, memberId, tx);
  // Outcome and shop only: never the token, the member ID or the name (as P1-14's verify, design check L8).
  log().info({ shopId: scope.shopId, via, found: member !== null }, "scan award");
  if (!member) throw new AppError("NOT_FOUND", NOT_A_MEMBER);
  if (member.userId === scope.userId) throw new AppError("FORBIDDEN", SELF_AWARD);

  const open = await openRequestOf(scope, member.membershipId, tx);
  if (open) return { outcome: "open_request", requestId: open };

  const requestId = await insertScanRequest(
    scope,
    {
      membershipId: member.membershipId,
      userId: member.userId,
      idempotencyKey: input.idempotencyKey,
    },
    tx,
  );
  if (!requestId) {
    // A concurrent retry with the same key committed first.
    const first = await scanByKey(scope, input.idempotencyKey, tx);
    if (first) return { outcome: "already_recorded", requestId: first };
    throw new AppError("CONFLICT");
  }
  return approveRequest(
    scope,
    { requestId, amountPence: input.amountPence, items: input.items },
    tx,
  );
}
