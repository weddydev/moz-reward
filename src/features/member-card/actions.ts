"use server";

import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { requireShopRole } from "@/server/authz";
import type { ShopScope } from "@/server/authz/scope";
import { limitOrThrow } from "@/server/security/rate-limit";
import { type MemberQrVerify, verifyMemberQrForShop } from "@/server/services/member-qr";
import { VERIFY_LIMITS } from "./limits";

/**
 * Staff read a customer's member QR (P1-14; the scanner UI is P2). The caller's role in the shop comes from the
 * session (requireShopRole), the lookup runs in that shop's scope. It reveals a name and leads to an award, so
 * both limits fail closed (design check M4): per team member per shop, and per shop.
 */
const input = z.object({ shopId: z.uuid(), token: z.string().min(1).max(128) }).strict();

export const verifyMemberQrAction = defineAction({
  name: "memberQr.verify",
  input,
  authorize: async ({ shopId }, p): Promise<ShopScope> => {
    const scope = await requireShopRole(shopId, ["owner", "staff"], p);
    await limitOrThrow({
      key: `action:memberQr.verify:shop:${shopId}`,
      ...VERIFY_LIMITS.shop,
      onError: "closed",
    });
    return scope;
  },
  rateLimit: {
    ...VERIFY_LIMITS.member,
    failMode: "closed",
    key: ({ shopId }, scope) => `${shopId}:${scope.userId}`,
  },
  handler: ({ token }, scope): Promise<MemberQrVerify> =>
    verifyMemberQrForShop(scope, token, Date.now()),
});
