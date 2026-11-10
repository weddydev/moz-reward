/**
 * Analytics consent (P0-13, COMPLIANCE §3; AC5: the analytics script is absent until consent). One first-party
 * cookie records the choice (strictly necessary to remember it, so it needs no consent itself). The version in
 * the value changes when the notice's wording changes, which asks everyone again (P5 final copy).
 */
export const CONSENT_COOKIE = "moz_consent";
export const CONSENT_VERSION = 1;
const MAX_AGE_SEC = 180 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

export function parseConsent(cookieHeader: string): ConsentChoice | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CONSENT_COOKIE) continue;
    const m = /^analytics-v(\d+)-(granted|denied)$/.exec(rest.join("="));
    if (m && Number(m[1]) === CONSENT_VERSION) return m[2] as ConsentChoice;
  }
  return null;
}

export function consentCookie(choice: ConsentChoice, secure: boolean): string {
  return [
    `${CONSENT_COOKIE}=analytics-v${String(CONSENT_VERSION)}-${choice}`,
    "Path=/",
    `Max-Age=${String(MAX_AGE_SEC)}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * The Umami tag. Same origin (Caddy proxies the path to the Umami container, P0-15), so the CSP needs no new
 * source; query strings and fragments are never sent (sign-in links carry tokens, C-26); Do Not Track honoured.
 */
export function umamiScriptAttributes(path: string, websiteId: string): Record<string, string> {
  return {
    src: `${path}/script.js`,
    "data-website-id": websiteId,
    "data-host-url": path,
    "data-exclude-search": "true",
    "data-exclude-hash": "true",
    "data-do-not-track": "true",
  };
}
