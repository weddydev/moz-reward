"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireCustomer } from "@/server/authz";
import { leaveShop, setShopMuted } from "@/server/services/membership";

/** Leave calls per user per hour, and mute toggles per user per hour (P1-09). Both fail closed. */
const LEAVE_CALLS = { max: 20, windowSec: 60 * 60 } as const;
const MUTE_CALLS = { max: 60, windowSec: 60 * 60 } as const;

const shopId = z.uuid().transform((id) => id.toLowerCase());

/** Router caches that showed the shop as joined: the Wallet list, the landing's "member" CTA, the page itself. */
const purgeMemberPages = (): void => {
  revalidatePath("/wallet");
  revalidatePath("/s/[code]", "page");
  revalidatePath("/shops/[id]", "page");
  revalidatePath("/vault/[id]", "page");
};

/**
 * "Leave shop" (PRODUCT §4, P1-09): the confirm sheet's one call. The member is the session user, never the
 * input. Enforced here and in the database, not only in the UI: the membership row is locked, closed and its
 * marketing consent withdrawn in one transaction (`leaveShop`). A second leave is a no-op success.
 */
export const leaveShopAction = defineAction({
  name: "membership.leave",
  input: z.object({ shopId }).strict(),
  authorize: (_input, p) => requireCustomer(p),
  rateLimit: { ...LEAVE_CALLS, failMode: "closed" },
  transaction: true,
  audit: (input, _scope, result: { left: boolean }) =>
    result.left
      ? {
          action: "membership.leave",
          entity: "shop",
          entityId: input.shopId,
        }
      : null,
  handler: async (input, scope, { tx, afterCommit }) => {
    if (!tx) throw new Error("membership.leave runs in a transaction");
    const result = await leaveShop(scope, input.shopId, tx);
    afterCommit(purgeMemberPages);
    return result;
  },
});

/** "Mute notifications" (P1-09): immediate; the switch on the shop page. Current members only. */
export const setShopMutedAction = defineAction({
  name: "membership.mute",
  input: z.object({ shopId, muted: z.boolean() }).strict(),
  authorize: (_input, p) => requireCustomer(p),
  rateLimit: { ...MUTE_CALLS, failMode: "closed" },
  transaction: true,
  audit: (input) => ({
    action: input.muted ? "membership.mute" : "membership.unmute",
    entity: "shop",
    entityId: input.shopId,
  }),
  handler: async (input, scope, { tx, afterCommit }) => {
    if (!tx) throw new Error("membership.mute runs in a transaction");
    const result = await setShopMuted(scope, input.shopId, input.muted, tx);
    afterCommit(() => {
      revalidatePath("/shops/[id]", "page");
    });
    return result;
  },
});
