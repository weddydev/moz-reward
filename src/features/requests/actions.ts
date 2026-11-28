"use server";

import { VERIFY_LIMITS } from "@/features/member-card/limits";
import { defineAction } from "@/server/actionTemplate";
import { requireShopRole } from "@/server/authz";
import type { ShopScope } from "@/server/authz/scope";
import { AppError } from "@/server/errors";
import { limitOrThrow } from "@/server/security/rate-limit";
import {
  type ApproveResult,
  approveRequest,
  ownerApprove,
  rejectRequest,
  reverseAward,
  type ReverseResult,
} from "@/server/services/approvals";
import { scanAward, type ScanAwardResult } from "@/server/services/scan-awards";
import {
  approveInput,
  ownerApproveInput,
  rejectInput,
  reverseInput,
  scanAwardInput,
} from "./input";

/**
 * The shop's decisions on points requests (P1-12, PRODUCT §5): approve, owner approval, reject, reverse. The
 * caller's role in the shop comes from the session (requireShopRole); the service re-reads it live and the
 * database's guards check it again. Every action is a money endpoint: rate limits fail closed (SECURITY §6),
 * per team member in the shop and per shop. Audit rows are written by the service, in the same transaction.
 */

/** Decisions per team member per shop per minute, and per shop per minute (a busy counter is ~1 every 10 s). */
const MEMBER_CALLS = { max: 60, windowSec: 60 } as const;
const SHOP_CALLS = { max: 300, windowSec: 60 } as const;

const PG_CONTENTION = new Set(["40P01", "40001"]);

/** A deadlock or serialisation failure: two decisions on the same rows at once. The caller may retry. */
async function contentionAsConflict<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    const e = err as { code?: unknown; cause?: { code?: unknown } };
    const code = e.cause?.code ?? e.code;
    if (typeof code === "string" && PG_CONTENTION.has(code)) throw new AppError("CONFLICT");
    throw err;
  }
}

async function teamScope(
  shopId: string,
  roles: ("owner" | "staff")[],
  p: Parameters<typeof requireShopRole>[2],
): Promise<ShopScope> {
  const scope = await requireShopRole(shopId, roles, p);
  await limitOrThrow({ key: `action:requests:shop:${shopId}`, ...SHOP_CALLS, onError: "closed" });
  return scope;
}

const memberKey = (input: { shopId: string }, scope: ShopScope): string =>
  `${input.shopId}:${scope.userId}`;

export const approveRequestAction = defineAction({
  name: "requests.approve",
  input: approveInput,
  authorize: ({ shopId }, p) => teamScope(shopId, ["owner", "staff"], p),
  rateLimit: { ...MEMBER_CALLS, failMode: "closed", key: memberKey },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<ApproveResult> => {
    if (!tx) throw new Error("requests.approve runs in a transaction");
    return contentionAsConflict(() => approveRequest(scope, input, tx));
  },
});

/** The owner decides an over-limit award a staff member sent them; the amount may be changed. */
export const ownerApproveAction = defineAction({
  name: "requests.owner-approve",
  input: ownerApproveInput,
  authorize: ({ shopId }, p) => teamScope(shopId, ["owner"], p),
  rateLimit: { ...MEMBER_CALLS, failMode: "closed", key: memberKey },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<ApproveResult> => {
    if (!tx) throw new Error("requests.owner-approve runs in a transaction");
    return contentionAsConflict(() => ownerApprove(scope, input, tx));
  },
});

export const rejectRequestAction = defineAction({
  name: "requests.reject",
  input: rejectInput,
  authorize: ({ shopId }, p) => teamScope(shopId, ["owner", "staff"], p),
  rateLimit: { ...MEMBER_CALLS, failMode: "closed", key: memberKey },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<{ requestId: string }> => {
    if (!tx) throw new Error("requests.reject runs in a transaction");
    return contentionAsConflict(() => rejectRequest(scope, input, tx));
  },
});

/** Owner any time, or the staff member who made the award within 15 minutes (the service decides which). */
export const reverseAwardAction = defineAction({
  name: "requests.reverse",
  input: reverseInput,
  authorize: ({ shopId }, p) => teamScope(shopId, ["owner", "staff"], p),
  rateLimit: { ...MEMBER_CALLS, failMode: "closed", key: memberKey },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<ReverseResult> => {
    if (!tx) throw new Error("requests.reverse runs in a transaction");
    return contentionAsConflict(() => reverseAward(scope, input, tx));
  },
});

/**
 * P2-02: award gold to a scanned member QR, or a member ID typed from an offline card (PRODUCT §5). The service
 * re-verifies the token and the current membership (design check M5). A typed member ID is a lookup that could be
 * used to probe IDs, so the award also has its own buckets sized like the member-QR verify limits (per team member
 * per shop, then per shop; both fail closed, P1-14 M4); they are separate from the verify's, as each scan calls
 * both. The member limit is spent before the shop's, so one account can't use up the counter's allowance.
 */
export const scanAwardAction = defineAction({
  name: "requests.scan-award",
  input: scanAwardInput,
  authorize: ({ shopId }, p) => teamScope(shopId, ["owner", "staff"], p),
  rateLimit: { ...MEMBER_CALLS, failMode: "closed", key: memberKey },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<ScanAwardResult> => {
    if (!tx) throw new Error("requests.scan-award runs in a transaction");
    await limitOrThrow({
      key: `action:requests.scan-award:lookup:${input.shopId}:${scope.userId}`,
      ...VERIFY_LIMITS.member,
      onError: "closed",
    });
    await limitOrThrow({
      key: `action:requests.scan-award:lookup:shop:${input.shopId}`,
      ...VERIFY_LIMITS.shop,
      onError: "closed",
    });
    const { member, idempotencyKey, amountPence, items } = input;
    return contentionAsConflict(() =>
      scanAward(scope, { member, idempotencyKey, amountPence, items }, tx),
    );
  },
});
