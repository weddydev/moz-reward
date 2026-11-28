"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireShopRole } from "@/server/authz";
import type { ShopScope } from "@/server/authz/scope";
import { limitOrThrow } from "@/server/security/rate-limit";
import { type MemberQrVerify, verifyMemberForShop } from "@/server/services/member-qr";
import { VERIFY_LIMITS } from "./limits";

/**
 * Staff read a customer's member QR, or the member ID typed from their offline card (P1-14; P2-02 scanner, exactly
 * one of the two). The caller's role in the shop comes from the
 * session (requireShopRole), the lookup runs in that shop's scope. It reveals a name and leads to an award, so
 * both limits fail closed (design check M4): per team member per shop, and per shop.
 */
const input = z.union([
  z.object({ shopId: z.uuid(), token: z.string().min(1).max(128) }).strict(),
  z.object({ shopId: z.uuid(), memberId: z.string().trim().min(1).max(16) }).strict(),
]);

export const verifyMemberQrAction = defineAction({
  name: "memberQr.verify",
  input,
  authorize: ({ shopId }, p): Promise<ShopScope> => requireShopRole(shopId, ["owner", "staff"], p),
  // Per team member first (the template's step), then per shop in the handler: a call the member limit refuses
  // never spends the shop's allowance (security review M1).
  rateLimit: {
    ...VERIFY_LIMITS.member,
    failMode: "closed",
    key: ({ shopId }, scope) => `${shopId}:${scope.userId}`,
  },
  handler: async (ref, scope): Promise<MemberQrVerify> => {
    const { shopId } = ref;
    await limitOrThrow({
      key: `action:memberQr.verify:shop:${shopId}`,
      ...VERIFY_LIMITS.shop,
      onError: "closed",
    });
    return verifyMemberForShop(
      scope,
      "token" in ref ? { token: ref.token } : { memberId: ref.memberId },
      Date.now(),
    );
  },
});
