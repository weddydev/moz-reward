"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { defineAction } from "@/server/actionTemplate";
import { ALL_SHOP_ROLES, requireShopRole } from "@/server/authz";
import { env } from "@/server/env";
import { activeShopCookie } from "@/server/portal/active-shop";

/**
 * Switch the shop the shop portal shows (P0-12 design): the caller must hold an active role in that shop.
 * The cookie only records the choice; every request re-checks it against the principal's memberships.
 * Setting a cookie makes Next re-render the tree (layouts included) in the answer; the client then goes to
 * the fixed `/dashboard`.
 */
export const switchShop = defineAction({
  name: "portal.switchShop",
  // Memberships hold lower-case ids; a valid upper-case UUID names the same shop.
  input: z.object({ shopId: z.uuid().transform((s) => s.toLowerCase()) }).strict(),
  authorize: ({ shopId }, p) => requireShopRole(shopId, ALL_SHOP_ROLES, p),
  rateLimit: { max: 30, windowSec: 60, failMode: "open" },
  handler: async (_input, scope) => {
    const cookie = activeShopCookie(env().APP_URL);
    // The id from the scope (the authorised membership), never the raw input.
    (await cookies()).set(cookie.name, scope.shopId, cookie.options);
    return { to: "/dashboard" as const };
  },
});
