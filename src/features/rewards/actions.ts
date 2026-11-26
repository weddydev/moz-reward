"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireCustomer, requireShopRole } from "@/server/authz";
import type { ShopScope } from "@/server/authz/scope";
import {
  type ConfirmResult,
  confirmRedemption,
  createRedemptionCode,
  type RedeemCodeResult,
} from "@/server/services/redemptions";

/**
 * Rewards and redemption (P1-16, PRODUCT §6). Both are money endpoints: their limits fail closed (SECURITY §6).
 * The customer is the session user and the shop the session's role in it, never the input. The confirm's
 * guessing guard (per team member and per shop, `redeem-guard.ts`) runs in the service, before any lookup.
 */

/** Redeem taps per user per 15 min (a new code voids the last: retries are cheap, floods are not). */
const CODE_CALLS = { max: 10, windowSec: 15 * 60 } as const;
/** Confirm calls per team member per minute (the guessing guard is the real limit; this caps request load). */
const CONFIRM_CALLS = { max: 30, windowSec: 60 } as const;

const uuid = z.uuid().transform((id) => id.toLowerCase());

export const createRedeemCodeAction = defineAction({
  name: "rewards.redeem-code",
  input: z.object({ rewardId: uuid }).strict(),
  authorize: (_input, p) => requireCustomer(p),
  rateLimit: { ...CODE_CALLS, failMode: "closed" },
  transaction: true,
  handler: async (input, scope, { tx }): Promise<RedeemCodeResult> => {
    if (!tx) throw new Error("rewards.redeem-code runs in a transaction");
    return createRedemptionCode(scope, input.rewardId, tx);
  },
});

export const confirmRedeemCodeAction = defineAction({
  name: "rewards.confirm",
  // Bounded before normalising; the service turns anything that can't be a code into "not recognised".
  input: z.object({ shopId: uuid, code: z.string().max(16) }).strict(),
  authorize: ({ shopId }, p): Promise<ShopScope> => requireShopRole(shopId, ["owner", "staff"], p),
  rateLimit: {
    ...CONFIRM_CALLS,
    failMode: "closed",
    key: (input: { shopId: string }, scope: ShopScope) => `${input.shopId}:${scope.userId}`,
  },
  // Not one transaction: the service runs the guard, then the confirm in its own transaction.
  transaction: false,
  handler: async (input, scope, { afterCommit }): Promise<ConfirmResult> => {
    const result = await confirmRedemption(scope, input.code);
    afterCommit(() => {
      revalidatePath("/dashboard/requests");
    });
    return result;
  },
});
