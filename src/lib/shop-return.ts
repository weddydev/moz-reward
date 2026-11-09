/**
 * Sign-in from a shop (P0-06, DESIGN §15 screen 2): when the return path is a shop landing page
 * (`/s/<code>`, ARCHITECTURE §4), the sign-in screen names the shop. Only an exact, well-formed path counts;
 * the return path itself is still validated separately by `safeReturnTo`. Codes are matched case-insensitively.
 */
const SHOP_PATH = /^\/s\/([2-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{6})(?:\?.*)?$/;

export function shopCodeFromReturnTo(returnTo: string | null | undefined): string | null {
  return SHOP_PATH.exec(returnTo ?? "")?.[1]?.toUpperCase() ?? null;
}
