import "server-only";
/**
 * The active-shop cookie (P0-12 design): which of a user's shops the shop portal shows. A shop UUID only and
 * never authority by itself: every request checks it against the principal's active memberships
 * (`pickActiveShop`). On https it is a `__Host-` cookie (Secure, path `/`, no Domain); plain-http servers
 * (local, E2E) use `moz_shop`, because browsers refuse `__Host-` cookies without Secure. Cleared on sign-out.
 */
export const ACTIVE_SHOP_MAX_AGE_S = 30 * 24 * 60 * 60;

export function activeShopCookie(appUrl: string): {
  name: "__Host-moz_shop" | "moz_shop";
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: "lax";
    path: "/";
    maxAge: number;
  };
} {
  const https = new URL(appUrl).protocol === "https:";
  return {
    name: https ? "__Host-moz_shop" : "moz_shop",
    options: {
      httpOnly: true,
      secure: https,
      sameSite: "lax",
      path: "/",
      maxAge: ACTIVE_SHOP_MAX_AGE_S,
    },
  };
}
