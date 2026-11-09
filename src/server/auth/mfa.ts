import "server-only";
/** Endpoints that create a session only after a second factor (or a phishing-resistant passkey). */
const MFA_SESSION_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
  "/passkey/verify-authentication",
]);

export const isMfaSessionPath = (path: string | undefined | null): boolean =>
  path != null && MFA_SESSION_PATHS.has(path);

/**
 * Non-MFA endpoints that may issue a staff/admin session: password sign-in (a TOTP challenge once enrolled) and
 * change-password (which re-issues the caller's session). Both produce `mfaVerified=false` sessions.
 */
const PRIVILEGED_NON_MFA_PATHS = new Set(["/sign-in/email", "/change-password"]);

/** Staff/admins must keep a second factor (SECURITY §2): Better Auth would delete it before failing. */
export const PRIVILEGED_FORBIDDEN_PATHS = new Set(["/two-factor/disable"]);

/**
 * Whether a staff/admin account may get a session from `path` (audit security #1). Email links, Google and
 * any other endpoint are refused: staff and admins sign in with password + second factor only (SECURITY §2).
 * Sessions created internally without a request (Better Auth test utilities) are allowed only in tests.
 */
export function privilegedSessionAllowed(
  path: string | undefined | null,
  opts: { testEnv: boolean },
): boolean {
  if (path == null) return opts.testEnv;
  return PRIVILEGED_NON_MFA_PATHS.has(path) || isMfaSessionPath(path);
}

/** Passkeys are a second factor: registering one needs a session that already passed MFA. */
export const PASSKEY_REGISTRATION_PATHS = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
]);

/**
 * Endpoints any staff/admin may call whatever state their current session is in: reading or ending it, and
 * signing in again (a stale cookie must never block a fresh sign-in or its second-factor challenge).
 */
const PRIVILEGED_ALWAYS_PATHS = new Set([
  "/get-session",
  "/sign-out",
  "/magic-link/verify",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/request-password-reset",
  "/reset-password",
]);
const isAlwaysAllowed = (path: string): boolean =>
  PRIVILEGED_ALWAYS_PATHS.has(path) ||
  path.startsWith("/sign-in/") ||
  path.startsWith("/callback/");

/** What a password-only staff/admin session may do: finish enrolling a second factor, or change its password. */
const PRIVILEGED_PRE_MFA_PATHS = new Set([
  "/two-factor/enable",
  "/two-factor/get-totp-uri",
  "/change-password",
]);

/**
 * Better Auth's own account endpoints (list/revoke sessions, update user, link accounts…) bypass our
 * require* policies, so the same rules are applied to them here (audit security #8): a staff/admin session
 * past its role's limit (staff 12 h, admin 2 h) may only sign out; one that hasn't passed a second factor
 * may only enrol one or change its password.
 */
export function privilegedRequestAllowed(input: {
  path: string;
  mfaVerified: boolean;
  sessionAgeMs: number;
  maxAgeMs: number;
}): boolean {
  if (isAlwaysAllowed(input.path)) return true;
  if (input.sessionAgeMs > input.maxAgeMs) return false;
  return input.mfaVerified || PRIVILEGED_PRE_MFA_PATHS.has(input.path);
}

export const isPrivilegedAlwaysPath = isAlwaysAllowed;
