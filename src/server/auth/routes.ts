import "server-only";

/**
 * Better Auth HTTP surface, reviewed (P0-19, SECURITY §10/§14). `/api/auth/*` serves ONLY the allowed
 * method + path pairs below; everything else answers 404 before Better Auth sees it (src/app/api/auth).
 * tests/integration/auth-routes.test.ts compares this file with what the installed Better Auth mounts, so a
 * library upgrade that adds an endpoint fails CI until it is reviewed here (allowed with a reason, or blocked).
 * Server code calling `getAuth().api.*` directly is not affected (tests, internal user creation).
 */
type Method = "GET" | "POST";
export type AllowedRoute = { method: readonly Method[]; path: string; why: string };
export type BlockedRoute = { path: string; why: string };

export const ALLOWED_AUTH_ROUTES: readonly AllowedRoute[] = [
  {
    method: ["GET", "POST"],
    path: "/get-session",
    why: "session read (client and proxy-free pages)",
  },
  { method: ["POST"], path: "/sign-out", why: "sign out" },
  { method: ["POST"], path: "/sign-in/email", why: "staff/admin password sign-in" },
  { method: ["POST"], path: "/sign-in/magic-link", why: "customer email link request" },
  { method: ["POST"], path: "/sign-in/social", why: "Google sign-in start" },
  { method: ["GET", "POST"], path: "/callback/:id", why: "OAuth callback (Google)" },
  { method: ["POST"], path: "/two-factor/enable", why: "staff TOTP enrolment" },
  { method: ["POST"], path: "/two-factor/verify-totp", why: "TOTP challenge" },
  { method: ["POST"], path: "/two-factor/verify-backup-code", why: "recovery code challenge" },
  { method: ["POST"], path: "/change-password", why: "staff first-password change" },
  { method: ["POST"], path: "/update-user", why: "display name (validated in the before hook)" },
  {
    method: ["GET"],
    path: "/passkey/generate-register-options",
    why: "passkey as second factor (MFA-gated, tested in mfa-bypass)",
  },
  {
    method: ["POST"],
    path: "/passkey/verify-registration",
    why: "passkey registration (MFA-gated)",
  },
  { method: ["GET"], path: "/passkey/generate-authenticate-options", why: "passkey sign-in" },
  { method: ["POST"], path: "/passkey/verify-authentication", why: "passkey sign-in" },
  {
    method: ["GET"],
    path: "/passkey/list-user-passkeys",
    why: "passkey management (passkey UI task)",
  },
  {
    method: ["POST"],
    path: "/passkey/delete-passkey",
    why: "passkey management (passkey UI task)",
  },
];

const NOT_USED = "not used by the app";
export const BLOCKED_AUTH_ROUTES: readonly BlockedRoute[] = [
  { path: "/error", why: "OAuth errors land on our /sign-in (onAPIError.errorURL)" },
  { path: "/account-info", why: NOT_USED },
  { path: "/list-accounts", why: NOT_USED },
  {
    path: "/link-social",
    why: "account linking is decided by our own rules (P0-06), not the library",
  },
  { path: "/unlink-account", why: NOT_USED },
  { path: "/get-access-token", why: "we never use provider tokens beyond sign-in" },
  { path: "/refresh-token", why: "we never use provider tokens beyond sign-in" },
  { path: "/change-email", why: "email change needs its own verified flow (not built)" },
  {
    path: "/delete-user",
    why: "account deletion is the data-rights flow (COMPLIANCE), not the library's",
  },
  { path: "/delete-user/callback", why: "see /delete-user" },
  { path: "/request-password-reset", why: "staff password reset comes with staff invites (P2)" },
  { path: "/reset-password", why: "see /request-password-reset" },
  { path: "/reset-password/:token", why: "see /request-password-reset" },
  { path: "/send-verification-email", why: "customers verify by magic link; staff by invite" },
  { path: "/verify-email", why: "see /send-verification-email" },
  {
    path: "/sign-up/email",
    why: "no public sign-up: staff come from invites, customers by magic link",
  },
  { path: "/list-sessions", why: "devices list is our own (P0-06 signed-in devices)" },
  { path: "/revoke-session", why: "devices list is our own" },
  { path: "/revoke-sessions", why: "devices list is our own" },
  { path: "/revoke-other-sessions", why: "devices list is our own" },
  { path: "/update-session", why: NOT_USED },
  { path: "/verify-password", why: NOT_USED },
  { path: "/ok", why: "health is /api/health (P0-13)" },
  {
    path: "/two-factor/disable",
    why: "a second factor can't be removed (privileged accounts need one)",
  },
  {
    path: "/two-factor/get-totp-uri",
    why: "enrolment returns the URI; re-reading it is not needed",
  },
  {
    path: "/two-factor/generate-backup-codes",
    why: "regenerating recovery codes is not built yet",
  },
  { path: "/two-factor/send-otp", why: "no email/SMS one-time codes (TOTP or passkey only)" },
  { path: "/two-factor/verify-otp", why: "see /two-factor/send-otp" },
  { path: "/passkey/update-passkey", why: "renaming passkeys is not built" },
];

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function matches(pattern: string, pathname: string): boolean {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return false;
  return want.every((part, i) => {
    const actual = got[i] ?? "";
    return part.startsWith(":") ? SEGMENT.test(actual) : part === actual;
  });
}

/** `pathname` is relative to /api/auth (e.g. "/sign-in/email"). */
export function isAllowedAuthRequest(method: string, pathname: string): boolean {
  return ALLOWED_AUTH_ROUTES.some(
    (r) => (r.method as readonly string[]).includes(method) && matches(r.path, pathname),
  );
}

/**
 * Reviewed endpoints that answer 404 at `/api/auth/*` but stay enabled in the library, because our own route
 * calls them through `getAuth().handler` after its own checks. Never in `disabledPaths`.
 */
export const INTERNAL_AUTH_ROUTES: readonly BlockedRoute[] = [
  {
    path: "/magic-link/verify",
    why: "consumed only by POST /api/sign-in/confirm after the user presses Sign in: mail scanners GET links (P0-19 AC3)",
  },
];

/** Exact paths Better Auth's own `disabledPaths` can block (no :params) — a second layer behind the route. */
export const DISABLED_PATHS = BLOCKED_AUTH_ROUTES.map((r) => r.path).filter(
  (p) => !p.includes(":"),
);

/** Mounted paths nobody reviewed, and reviewed paths the library no longer mounts. */
export function reviewGaps(mounted: readonly string[]): { unreviewed: string[]; stale: string[] } {
  const reviewed = new Set(
    [...ALLOWED_AUTH_ROUTES, ...BLOCKED_AUTH_ROUTES, ...INTERNAL_AUTH_ROUTES].map((r) => r.path),
  );
  const present = new Set(mounted);
  return {
    unreviewed: [...present].filter((p) => !reviewed.has(p)).sort(),
    stale: [...reviewed].filter((p) => !present.has(p)).sort(),
  };
}
