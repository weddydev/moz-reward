import "server-only";

/**
 * Auth cookie settings (P0-06, SECURITY §2). On https every Better Auth cookie is a `__Host-` cookie: Secure,
 * Path=/ and no Domain, so a sibling subdomain can't set or shadow it. Better Auth's own `useSecureCookies`
 * would add a `__Secure-` prefix in front of ours, so it stays off and `secure` is set directly. Plain-http
 * servers (local, E2E) keep a plain `moz.` prefix because browsers refuse `__Host-` cookies without Secure.
 */
export function authCookieOptions(appUrl: string): {
  cookiePrefix: string;
  useSecureCookies: false;
  defaultCookieAttributes: { secure: boolean; path: "/"; sameSite: "lax"; httpOnly: true };
} {
  const https = new URL(appUrl).protocol === "https:";
  return {
    cookiePrefix: https ? "__Host-moz" : "moz",
    useSecureCookies: false,
    defaultCookieAttributes: { secure: https, path: "/", sameSite: "lax", httpOnly: true },
  };
}
