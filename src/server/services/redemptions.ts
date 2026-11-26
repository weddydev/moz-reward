import "server-only";
import { withUniqueCode } from "@/lib/codes";
import { shopRedeemable } from "@/lib/loyalty/redeem";
import type { CustomerScope, ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import { notify } from "@/server/notifications/notify";
import { publishRealtime } from "@/server/realtime/publish";
import { transaction } from "@/server/repos/_base";
import { activeOwnerIds } from "@/server/repos/approvals";
import { lockOwnCurrentMembership } from "@/server/repos/memberships";
import {
  confirmCode,
  countLiveCodes,
  insertOwnCode,
  lockCodeByHash,
  readConfirmTarget,
  readOwnCodeStatus,
  readOwnReward,
  voidOwnLiveCodes,
} from "@/server/repos/redemptions";
import { humanWait, UNAVAILABLE_RETRY_SEC } from "@/server/security/rate-limit";
import {
  generateRedeemCode,
  normaliseRedeemCode,
  redeemCodeHash,
} from "@/server/security/redeem-code";
import {
  type RedeemGuardDecision,
  RedeemGuardUnavailable,
  releaseRedeemAttempt,
  reserveRedeemAttempt,
} from "@/server/security/redeem-guard";
import { audit } from "@/server/services/audit";

/**
 * Rewards and redemption (P1-16; PRODUCT §6 "Redemption", §15; ARCHITECTURE §5 "Redeem"; SECURITY §6). The
 * customer's Redeem makes a 6-character code valid 15 minutes (one live code per member: a new one voids the
 * old); the team confirms it in its own shop in one transaction (code → confirmed, reward redeemed, 0-gold
 * `redeem` ledger row, realtime + in-app notice, audit). Every rule is also a database wall (0034).
 */

export const REDEEM_MESSAGES = {
  rewardMissing: "We couldn't find that reward.",
  left: "You've left this shop. Rejoin it to redeem your rewards.",
  alreadyRedeemed: "Already redeemed.",
  rewardExpired: "This reward has expired.",
  shopNotRedeeming: "This shop isn't redeeming rewards at the moment.",
  notRecognised: "Code not recognised. Check it with the customer.",
  replaced: "This code was replaced by a newer one. Ask the customer for the code on their screen.",
  codeExpired: "This code has expired. Ask the customer for a new one.",
  ownReward: "You can't redeem your own reward.",
} as const;

export type RedeemCodeResult = {
  codeId: string;
  code: string;
  shopName: string;
  rewardLabel: string;
  /** Epoch ms (server clock). */
  expiresAt: number;
  serverNow: number;
};

/** The customer's Redeem: a fresh code for one of their ready rewards (voids their previous live code). */
export async function createRedemptionCode(
  scope: CustomerScope,
  rewardId: string,
  tx: Transaction,
): Promise<RedeemCodeResult> {
  const reward = await readOwnReward(scope, rewardId, tx);
  if (!reward) throw new AppError("NOT_FOUND", REDEEM_MESSAGES.rewardMissing);
  const now = new Date();
  if (reward.leftAt) throw new AppError("FORBIDDEN", REDEEM_MESSAGES.left);
  if (reward.redeemedAt) throw new AppError("CONFLICT", REDEEM_MESSAGES.alreadyRedeemed);
  if (reward.expiresAt.getTime() <= now.getTime())
    throw new AppError("CONFLICT", REDEEM_MESSAGES.rewardExpired);
  if (!shopRedeemable({ status: reward.shopStatus, closedAt: reward.shopClosedAt }, now))
    throw new AppError("FORBIDDEN", REDEEM_MESSAGES.shopNotRedeeming);
  // One Redeem at a time per member: two taps (or tabs) take turns here, and the second voids the first's code.
  if (!(await lockOwnCurrentMembership(scope, reward.shopId, tx)))
    throw new AppError("FORBIDDEN", REDEEM_MESSAGES.left);
  await voidOwnLiveCodes(scope, [reward.membershipId], "regenerated", tx);
  const { code, row } = await withUniqueCode(
    async (c: string) => ({
      code: c,
      row: await insertOwnCode(
        scope,
        {
          shopId: reward.shopId,
          membershipId: reward.membershipId,
          rewardId: reward.id,
          codeHash: redeemCodeHash(reward.shopId, c),
        },
        tx,
      ),
    }),
    generateRedeemCode,
  );
  await audit(tx, {
    actor: scope,
    action: "redemption.code_created",
    entity: "reward",
    entityId: reward.id,
    meta: { codeId: row.id, shopId: reward.shopId },
  });
  return {
    codeId: row.id,
    code,
    shopName: reward.shopName,
    rewardLabel: reward.label,
    expiresAt: row.expiresAt.getTime(),
    serverNow: row.serverNow.getTime(),
  };
}

export type ConfirmResult = {
  redemptionId: string;
  rewardLabel: string;
  kind: "main" | "milestone" | "game" | "other";
};

function refused(decision: Exclude<RedeemGuardDecision, { kind: "reserved" }>): AppError {
  const wait = humanWait(decision.retryAfterSec);
  const message =
    decision.kind === "shop_exhausted"
      ? `Too many wrong codes have been tried at this shop today. Confirming codes is paused for ${wait}.`
      : `Too many wrong codes. Please try again in ${wait}.`;
  return new AppError("RATE_LIMITED", message, undefined, {
    retryAfterSec: decision.retryAfterSec,
  });
}

/**
 * The team confirms a code in its own shop (the shop is the session's, never the input's). The guessing guard
 * reserves the attempt first (SECURITY §6); only a committed confirm gives it back. Not one transaction with the
 * guard: a refusal's audit row and owner notice must commit although the confirm doesn't happen.
 */
export async function confirmRedemption(scope: ShopScope, input: string): Promise<ConfirmResult> {
  const code = normaliseRedeemCode(input);
  const liveCodes = await countLiveCodes(scope);
  let decision: RedeemGuardDecision;
  try {
    decision = await reserveRedeemAttempt({
      shopId: scope.shopId,
      staffId: scope.userId,
      liveCodes,
    });
  } catch (err) {
    if (err instanceof RedeemGuardUnavailable)
      throw new AppError("UNAVAILABLE", undefined, undefined, {
        retryAfterSec: UNAVAILABLE_RETRY_SEC,
      });
    throw err;
  }
  if (decision.kind !== "reserved") {
    if (decision.kind === "shop_exhausted" && decision.firstRefusal) {
      await pausedNotice(scope, decision.retryAfterSec);
    }
    throw refused(decision);
  }
  // A typed value that can't be a code still counted (above), and never reaches the database.
  if (!code) throw new AppError("NOT_FOUND", REDEEM_MESSAGES.notRecognised);
  const result = await transaction(scope, (tx) => confirmInTransaction(scope, code, tx));
  await releaseRedeemAttempt(decision.reservation);
  return result;
}

async function pausedNotice(scope: ShopScope, retryAfterSec: number): Promise<void> {
  const until = new Date(Date.now() + retryAfterSec * 1000).toISOString();
  log().warn({ shopId: scope.shopId }, "redeem guessing budget used up");
  await transaction(scope, async (tx) => {
    await audit(tx, {
      actor: scope,
      action: "redemption.budget_exhausted",
      entity: "shop",
      entityId: scope.shopId,
      meta: { until },
    });
    await notify(scope, tx, await activeOwnerIds(scope, tx), {
      type: "redeem_codes_paused",
      shopId: scope.shopId,
      payload: { shopId: scope.shopId, until },
    });
  });
}

async function confirmInTransaction(
  scope: ShopScope,
  code: string,
  tx: Transaction,
): Promise<ConfirmResult> {
  const locked = await lockCodeByHash(scope, redeemCodeHash(scope.shopId, code), tx);
  if (!locked) throw new AppError("NOT_FOUND", REDEEM_MESSAGES.notRecognised);
  if (locked.status === "confirmed")
    throw new AppError("CONFLICT", REDEEM_MESSAGES.alreadyRedeemed);
  if (locked.status === "voided") throw new AppError("NOT_FOUND", REDEEM_MESSAGES.replaced);
  if (locked.checkedAt.getTime() >= locked.expiresAt.getTime())
    throw new AppError("CONFLICT", REDEEM_MESSAGES.codeExpired);
  const target = await readConfirmTarget(scope, locked, tx);
  if (!target || target.leftAt) throw new AppError("NOT_FOUND", REDEEM_MESSAGES.notRecognised);
  if (target.redeemedAt) throw new AppError("CONFLICT", REDEEM_MESSAGES.alreadyRedeemed);
  if (target.expiresAt.getTime() <= locked.checkedAt.getTime())
    throw new AppError("CONFLICT", REDEEM_MESSAGES.rewardExpired);
  if (target.userId === scope.userId) throw new AppError("FORBIDDEN", REDEEM_MESSAGES.ownReward);
  if (
    !shopRedeemable({ status: target.shopStatus, closedAt: target.shopClosedAt }, locked.checkedAt)
  )
    throw new AppError("FORBIDDEN", REDEEM_MESSAGES.shopNotRedeeming);

  await confirmCode(scope, locked, tx);
  await publishRealtime(
    scope,
    tx,
    [
      { kind: "user", id: target.userId },
      { kind: "shop", id: scope.shopId },
    ],
    { type: "redemption_confirmed", data: { shopId: scope.shopId, redemptionId: locked.id } },
  );
  await notify(scope, tx, [target.userId], {
    type: "reward_redeemed",
    shopId: scope.shopId,
    payload: { shopId: scope.shopId, rewardId: locked.rewardId, redemptionId: locked.id },
  });
  await audit(tx, {
    actor: scope,
    action: "redemption.confirmed",
    entity: "reward",
    entityId: locked.rewardId,
    meta: { redemptionId: locked.id },
  });
  return { redemptionId: locked.id, rewardLabel: target.label, kind: target.kind };
}

/** Has the shop confirmed the caller's code yet? (The open code asks after a `redemption_confirmed` hint.) */
export async function redemptionCodeStatus(
  scope: CustomerScope,
  codeId: string,
): Promise<{ status: "live" | "voided" | "confirmed" }> {
  const status = await readOwnCodeStatus(scope, codeId);
  if (!status) throw new AppError("NOT_FOUND");
  return { status };
}
