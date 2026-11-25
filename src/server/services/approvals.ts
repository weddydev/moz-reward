import "server-only";
import { type Pence, pence, points } from "@/lib/brand";
import { newId } from "@/lib/id";
import { receiptInitials } from "@/lib/initials";
import {
  type Award,
  applyAward,
  applyReversal,
  calculateAward,
  type MemberState,
} from "@/lib/loyalty/engine";
import { type ProgrammeVersion, versionActiveAt } from "@/lib/loyalty/programme";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import type { ReceiptData, RejectReason, ReversalReason } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { notify } from "@/server/notifications/notify";
import { publishRealtime } from "@/server/realtime/publish";
import {
  activeOwnerIds,
  approveTeamRequest,
  awardedGold,
  findTeamReceipt,
  findTeamRequest,
  insertLedgerRows,
  insertReceipt,
  insertRewards,
  isReversed,
  type LedgerRow,
  lockTeamMembership,
  lockTeamRequest,
  nextReceiptNumber,
  type NewReward,
  readAwardCap,
  readOwnName,
  readOwnStaffRow,
  readReceiptShop,
  rejectTeamRequest,
  routeTeamRequest,
  type TeamMembership,
  type TeamRequest,
  transactionNow,
  updateMembershipLoyalty,
} from "@/server/repos/approvals";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import { audit } from "@/server/services/audit";
import { REQUEST_TTL_MS } from "./point-request-jobs";

/**
 * Approve, reject, owner approval and reversal (P1-12, PRODUCT §5, §6, §11; ENGINEERING §7). One transaction
 * each, as the shop's team. Every rule is checked here first (a friendly answer) and again by 0029's guards (the
 * wall, DECISIONS 26 Nov). The order inside the transaction follows the guards and the lock order:
 *   the request (plain read) → lock the membership → lock the request and re-check it → the caller's staff row
 *   (live: deactivated, limit changed) → the engine → the request's decision → ledger rows → the membership's
 *   new state → rewards → the receipt counter → the receipt → notifications and realtime hints (outbox) → audit.
 * The database's `now()` is read once and is the instant of everything written (approval time, ingot start).
 * Nothing leaves the transaction except through the outbox, so a rolled-back approval sends nothing.
 */

export const REQUEST_NOT_FOUND = "We couldn't find that request. It may belong to another shop.";
export const ALREADY_DECIDED = "This request has already been dealt with. Refresh to see it.";
export const REQUEST_EXPIRED =
  "This request expired after 24 hours. The customer can send a new one.";
export const SELF_AWARD = "You can't award gold to your own account. Ask another team member.";
export const MEMBER_LEFT =
  "This customer has left the shop, so their gold is frozen and can't change.";
export const NOT_ON_TEAM = "You're no longer on this shop's team.";
export const OWNER_ONLY = "This award is waiting for the owner's approval.";
export const AMOUNT_REQUIRED = "Enter the amount spent. This shop gives gold per £1.";
export const NO_GOLD = "That amount doesn't earn any gold. Check the amount spent.";
export const NO_PROGRAMME = "Set up your loyalty programme before awarding gold.";
export const RECEIPT_NOT_FOUND = "We couldn't find that receipt.";
export const ALREADY_REVERSED = "This award has already been reversed.";
export const REVERSAL_TOO_LATE =
  "Only the owner can reverse an award after 15 minutes, or one another team member made.";

/** A staff member may reverse their own award for this long (PRODUCT §5). */
export const STAFF_REVERSAL_WINDOW_MS = 15 * 60 * 1000;

export const capMessage = (cap: { pence: number; gold: number }): string =>
  `That's over the limit for one award (£${(cap.pence / 100).toLocaleString("en-GB")} or ${cap.gold.toLocaleString("en-GB")} gold). Split it or ask support.`;

export type AwardInput = {
  requestId: string;
  /** Amount spent; required for a per-pound programme, optional (receipt only) for per-visit. */
  amountPence?: number | null | undefined;
  items?: readonly string[] | null | undefined;
};

export type ApproveResult =
  | {
      outcome: "approved";
      requestId: string;
      receiptId: string;
      receiptNumber: number;
      /** Gold on the ledger: earned + streak bonus. */
      gold: number;
      bonusGold: number;
      rewardIds: string[];
    }
  | { outcome: "awaiting_owner"; requestId: string; gold: number };

type TeamRow = { role: "owner" | "staff"; perAwardLimit: number | null };
type Locked = { request: TeamRequest; membership: TeamMembership; team: TeamRow; now: Date };

/**
 * Checks the caller is still an active team member (read first: RLS hides the shop's rows from a deactivated
 * one, who should hear why), finds the request in the scoped shop, locks its membership then the request, and
 * checks it can still be decided: open, inside its 24 h, not the caller's own, the member still in the shop.
 */
async function lockOpenRequest(
  scope: ShopScope,
  requestId: string,
  tx: Transaction,
): Promise<Locked> {
  const now = await transactionNow(scope, tx);
  const team = await liveTeamRow(scope, tx);
  const seen = await findTeamRequest(scope, requestId, tx);
  if (!seen) throw new AppError("NOT_FOUND", REQUEST_NOT_FOUND);
  const membership = await lockTeamMembership(scope, seen.membershipId, tx);
  const request = await lockTeamRequest(scope, requestId, tx);
  if (!membership || !request) throw new AppError("NOT_FOUND", REQUEST_NOT_FOUND);
  if (request.userId === scope.userId || membership.userId === scope.userId)
    throw new AppError("FORBIDDEN", SELF_AWARD);
  if (request.status !== "pending" && request.status !== "awaiting_owner")
    throw new AppError("CONFLICT", ALREADY_DECIDED);
  if (now.getTime() - request.requestedAt.getTime() >= REQUEST_TTL_MS)
    throw new AppError("CONFLICT", REQUEST_EXPIRED);
  if (membership.leftAt !== null) throw new AppError("CONFLICT", MEMBER_LEFT);
  return { request, membership, team, now };
}

/** The caller's live team row: active, with its role and limit (not the session's, which may be stale). */
async function liveTeamRow(scope: ShopScope, tx: Transaction): Promise<TeamRow> {
  const row = await readOwnStaffRow(scope, tx);
  if (!row?.active) throw new AppError("FORBIDDEN", NOT_ON_TEAM);
  return row;
}

const memberState = (m: TeamMembership): MemberState => ({
  progress: points(m.progressGold),
  ingotsCompleted: m.ingotsCompleted,
  ingotStartedAt: m.ingotStartedAt ?? m.joinedAt,
  milestonesReached: m.milestonesReached,
  shortfall: points(m.goldShortfall),
  tier: m.tier,
  streak: { weeks: m.streakWeeks, lastWeekStart: m.streakLastWeekStart },
});

function normaliseItems(items: readonly string[] | null | undefined): string[] | null {
  const list = (items ?? []).map((i) => i.trim()).filter((i) => i.length > 0);
  return list.length > 0 ? list : null;
}

/** The engine's award for this request, after the programme and platform-cap checks. */
async function priceAward(
  scope: ShopScope,
  locked: Locked,
  input: { amountPence: number | null; versions: readonly ProgrammeVersion[] },
  tx: Transaction,
): Promise<Award> {
  const rules = versionActiveAt(input.versions, locked.request.requestedAt);
  if (!rules) throw new AppError("FORBIDDEN", NO_PROGRAMME);
  if (rules.earnMode === "per_pound" && input.amountPence === null)
    throw new AppError("VALIDATION", AMOUNT_REQUIRED, { amountPence: [AMOUNT_REQUIRED] });
  const cap = await readAwardCap(scope, tx);
  if (input.amountPence !== null && input.amountPence > cap.pence)
    throw new AppError("LIMIT_REACHED", capMessage(cap));
  const amount: Pence | null = input.amountPence === null ? null : pence(input.amountPence);
  const award = calculateAward({
    versions: input.versions,
    amountPence: amount,
    requestedAt: locked.request.requestedAt,
    // Happy hour and other multipliers plug in here (P3-05), judged at `requestedAt`.
    multipliers: [],
    streak: {
      weeks: locked.membership.streakWeeks,
      lastWeekStart: locked.membership.streakLastWeekStart,
    },
  });
  if (award.earned <= 0) throw new AppError("VALIDATION", NO_GOLD, { amountPence: [NO_GOLD] });
  if (award.total > cap.gold) throw new AppError("LIMIT_REACHED", capMessage(cap));
  return award;
}

/**
 * Staff or owner approves a request (P1-12). A staff member's award above their per-award limit goes to the
 * owner instead (`awaiting_owner`, same 24 h). An `awaiting_owner` request is decided by an owner only
 * (`ownerApprove`, which may change the amount).
 */
export async function approveRequest(
  scope: ShopScope,
  input: AwardInput,
  tx: Transaction,
): Promise<ApproveResult> {
  const locked = await lockOpenRequest(scope, input.requestId, tx);
  if (locked.request.status === "awaiting_owner" && locked.team.role !== "owner")
    throw new AppError("FORBIDDEN", OWNER_ONLY);
  return decide(scope, locked, input, tx);
}

/**
 * The owner decides an award a staff member sent them (`awaiting_owner`). The amount and items default to what
 * the staff member entered and may be changed (PRODUCT §5 "amount editable").
 */
export async function ownerApprove(
  scope: ShopScope,
  input: AwardInput,
  tx: Transaction,
): Promise<ApproveResult> {
  const locked = await lockOpenRequest(scope, input.requestId, tx);
  if (locked.team.role !== "owner") throw new AppError("FORBIDDEN", OWNER_ONLY);
  if (locked.request.status !== "awaiting_owner") throw new AppError("CONFLICT", ALREADY_DECIDED);
  return decide(
    scope,
    locked,
    {
      requestId: input.requestId,
      amountPence: input.amountPence === undefined ? locked.request.amountPence : input.amountPence,
      items: input.items === undefined ? locked.request.items : input.items,
    },
    tx,
  );
}

async function decide(
  scope: ShopScope,
  locked: Locked,
  input: AwardInput,
  tx: Transaction,
): Promise<ApproveResult> {
  const { request, membership, team, now } = locked;
  const versions = await listProgrammeVersions(scope, tx);
  const amountPence = input.amountPence ?? null;
  const items = normaliseItems(input.items);
  const award = await priceAward(scope, locked, { amountPence, versions }, tx);
  const gold: number = award.total;

  if (team.role === "staff" && team.perAwardLimit !== null && gold > team.perAwardLimit) {
    await routeTeamRequest(scope, request.id, { amountPence, items, awardGold: gold }, tx);
    const owners = await activeOwnerIds(scope, tx);
    await notify(scope, tx, owners, {
      type: "request_awaiting_owner",
      shopId: scope.shopId,
      payload: { shopId: scope.shopId, requestId: request.id, gold },
    });
    await publishRealtime(scope, tx, [{ kind: "shop", id: scope.shopId }], {
      type: "request_decided",
      data: { requestId: request.id, shopId: scope.shopId, outcome: "awaiting_owner" },
    });
    await audit(tx, {
      actor: scope,
      action: "point_request.route_to_owner",
      entity: "point_request",
      entityId: request.id,
      meta: { gold, limit: team.perAwardLimit },
    });
    return { outcome: "awaiting_owner", requestId: request.id, gold };
  }

  await approveTeamRequest(scope, request.id, { amountPence, items, awardGold: gold }, tx);

  const receiptId = newId();
  const ref = { requestId: request.id, receiptId, version: award.version, base: award.base };
  const ledger: LedgerRow[] = [
    {
      membershipId: membership.id,
      type: "earn",
      points: award.earned,
      programVersion: award.version,
      requestId: request.id,
      receiptId,
      idempotencyKey: `${request.id}:earn`,
      ref,
    },
  ];
  if (award.streakBonus > 0) {
    ledger.push({
      membershipId: membership.id,
      type: "bonus_streak",
      points: award.streakBonus,
      programVersion: award.version,
      requestId: request.id,
      receiptId,
      idempotencyKey: `${request.id}:bonus_streak`,
      ref: { requestId: request.id, receiptId, version: award.version },
    });
  }
  await insertLedgerRows(scope, ledger, tx);

  const outcome = applyAward(memberState(membership), award, versions, now);
  await updateMembershipLoyalty(
    scope,
    membership.id,
    {
      progressGold: outcome.state.progress,
      ingotsCompleted: outcome.state.ingotsCompleted,
      // Stored from the first award on (C-60): null meant "since joined_at".
      ingotStartedAt: outcome.state.ingotStartedAt,
      milestonesReached: outcome.state.milestonesReached,
      goldShortfall: outcome.state.shortfall,
      tier: outcome.state.tier,
      streakWeeks: outcome.state.streak.weeks,
      streakLastWeekStart: outcome.state.streak.lastWeekStart,
      visitAt: request.requestedAt,
    },
    tx,
  );

  const unlocked: NewReward[] = [
    ...outcome.milestones.map((m) => ({
      membershipId: membership.id,
      kind: "milestone" as const,
      label: m.reward,
      ingotNumber: m.ingotNumber,
      milestonePercent: m.percent,
      rewardsVersion: m.rewardsVersion,
      isMystery: m.isMystery,
      requestId: request.id,
    })),
    ...outcome.ingots.map((i) => ({
      membershipId: membership.id,
      kind: "main" as const,
      label: i.mainReward.text,
      ingotNumber: i.ingotNumber,
      milestonePercent: null,
      rewardsVersion: i.rewardsVersion,
      isMystery: false,
      requestId: request.id,
    })),
  ];
  const rewardIds = await insertRewards(scope, unlocked, tx);

  const number = await nextReceiptNumber(scope, tx);
  const shop = await readReceiptShop(scope, tx);
  const name = await readOwnName(scope, tx);
  const data: ReceiptData = {
    shopName: shop.name,
    address: shop.address,
    vatNumber: shop.vatNumber,
    requestedAt: request.requestedAt.toISOString(),
    approvedAt: now.toISOString(),
    items: items ?? [],
    amountPence,
    goldEarned: award.earned,
    bonusGold: award.streakBonus,
    staffInitials: receiptInitials(name),
  };
  await insertReceipt(
    scope,
    { id: receiptId, membershipId: membership.id, requestId: request.id, number, data },
    tx,
  );

  await notify(scope, tx, [membership.userId], {
    type: "request_approved",
    shopId: scope.shopId,
    payload: {
      shopId: scope.shopId,
      requestId: request.id,
      receiptId,
      receiptNumber: number,
      gold,
    },
  });
  const member = { kind: "user" as const, id: membership.userId };
  await publishRealtime(scope, tx, [{ kind: "shop", id: scope.shopId }, member], {
    type: "request_decided",
    data: { requestId: request.id, shopId: scope.shopId, outcome: "approved" },
  });
  await publishRealtime(scope, tx, [member], {
    type: "points_credited",
    data: { shopId: scope.shopId },
  });
  for (const rewardId of rewardIds) {
    await publishRealtime(scope, tx, [member], {
      type: "reward_unlocked",
      data: { shopId: scope.shopId, rewardId },
    });
  }
  await audit(tx, {
    actor: scope,
    action: "point_request.approve",
    entity: "point_request",
    entityId: request.id,
    meta: {
      receiptId,
      receiptNumber: number,
      gold,
      bonusGold: award.streakBonus,
      version: award.version,
      rewards: rewardIds.length,
      routed: request.status === "awaiting_owner",
    },
  });

  return {
    outcome: "approved",
    requestId: request.id,
    receiptId,
    receiptNumber: number,
    gold,
    bonusGold: award.streakBonus,
    rewardIds,
  };
}

/**
 * Rejects a request with a preset reason and optional note (PRODUCT §5). Staff reject pending requests; an
 * `awaiting_owner` one is the owner's. The customer is told the reason, never the note.
 */
export async function rejectRequest(
  scope: ShopScope,
  input: { requestId: string; reason: RejectReason; note?: string | null | undefined },
  tx: Transaction,
): Promise<{ requestId: string }> {
  const { request, membership, team } = await lockOpenRequest(scope, input.requestId, tx);
  if (request.status === "awaiting_owner" && team.role !== "owner")
    throw new AppError("FORBIDDEN", OWNER_ONLY);
  const note = input.note?.trim() ? input.note.trim() : null;
  await rejectTeamRequest(scope, request.id, { code: input.reason, note }, tx);
  await notify(scope, tx, [membership.userId], {
    type: "request_rejected",
    shopId: scope.shopId,
    payload: { shopId: scope.shopId, requestId: request.id, reason: input.reason },
  });
  await publishRealtime(
    scope,
    tx,
    [
      { kind: "shop", id: scope.shopId },
      { kind: "user", id: membership.userId },
    ],
    {
      type: "request_decided",
      data: { requestId: request.id, shopId: scope.shopId, outcome: "rejected" },
    },
  );
  await audit(tx, {
    actor: scope,
    action: "point_request.reject",
    entity: "point_request",
    entityId: request.id,
    meta: { reason: input.reason, hasNote: note !== null },
  });
  return { requestId: request.id };
}

export type ReverseResult = {
  receiptId: string;
  gold: number;
  /** Gold taken from the current ingot. */
  fromProgress: number;
  /** Gold progress couldn't cover: the member's shortfall grew by this. */
  toShortfall: number;
  shortfall: number;
};

/**
 * Reverses an approved award (refund or mistake, PRODUCT §5): the owner, or the staff member who made it within
 * 15 minutes. Takes the award's gold off current-ingot progress, floored at 0, and records the rest as a
 * shortfall that later earns pay off first. Completed ingots, unlocked rewards, milestones and tier stay. The
 * reason is a preset code (on the ledger); the optional note goes to the audit log only.
 */
export async function reverseAward(
  scope: ShopScope,
  input: { receiptId: string; reason: ReversalReason; note?: string | null | undefined },
  tx: Transaction,
): Promise<ReverseResult> {
  const now = await transactionNow(scope, tx);
  const team = await liveTeamRow(scope, tx);
  const seen = await findTeamReceipt(scope, input.receiptId, tx);
  if (!seen) throw new AppError("NOT_FOUND", RECEIPT_NOT_FOUND);
  // The membership lock serialises two reversals of one receipt (the partial unique index is the backstop).
  const membership = await lockTeamMembership(scope, seen.membershipId, tx);
  if (!membership) throw new AppError("NOT_FOUND", RECEIPT_NOT_FOUND);
  if (membership.userId === scope.userId) throw new AppError("FORBIDDEN", SELF_AWARD);
  const ownRecent =
    seen.createdBy === scope.userId &&
    now.getTime() - seen.createdAt.getTime() < STAFF_REVERSAL_WINDOW_MS;
  if (team.role !== "owner" && !ownRecent) throw new AppError("FORBIDDEN", REVERSAL_TOO_LATE);
  if (await isReversed(scope, seen.id, tx)) throw new AppError("CONFLICT", ALREADY_REVERSED);

  const gold = await awardedGold(scope, seen.requestId, tx);
  if (gold <= 0) throw new AppError("CONFLICT", ALREADY_REVERSED);
  await insertLedgerRows(
    scope,
    [
      {
        membershipId: membership.id,
        type: "reversal",
        points: -gold,
        programVersion: null,
        requestId: seen.requestId,
        receiptId: seen.id,
        idempotencyKey: `${seen.id}:reversal`,
        ref: { receiptId: seen.id, requestId: seen.requestId, reason: input.reason },
      },
    ],
    tx,
  );
  const outcome = applyReversal(memberState(membership), points(gold));
  await updateMembershipLoyalty(
    scope,
    membership.id,
    {
      progressGold: outcome.state.progress,
      ingotsCompleted: membership.ingotsCompleted,
      ingotStartedAt: membership.ingotStartedAt,
      milestonesReached: membership.milestonesReached,
      goldShortfall: outcome.state.shortfall,
      tier: membership.tier,
      streakWeeks: membership.streakWeeks,
      streakLastWeekStart: membership.streakLastWeekStart,
    },
    tx,
  );

  await notify(scope, tx, [membership.userId], {
    type: "award_reversed",
    shopId: scope.shopId,
    payload: {
      shopId: scope.shopId,
      receiptId: seen.id,
      receiptNumber: seen.number,
      gold,
      shortfall: outcome.state.shortfall,
      reason: input.reason,
    },
  });
  const note = input.note?.trim() ? input.note.trim() : null;
  await audit(tx, {
    actor: scope,
    action: "ledger.reverse",
    entity: "receipt",
    entityId: seen.id,
    meta: {
      requestId: seen.requestId,
      receiptNumber: seen.number,
      gold,
      fromProgress: outcome.fromProgress,
      toShortfall: outcome.toShortfall,
      reason: input.reason,
      ...(note ? { note } : {}),
    },
  });
  return {
    receiptId: seen.id,
    gold,
    fromProgress: outcome.fromProgress,
    toShortfall: outcome.toShortfall,
    shortfall: outcome.state.shortfall,
  };
}
