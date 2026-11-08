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
export function privilegedSessionAllowed(path: string | undefined | null, opts: { testEnv: boolean }): boolean {
  if (path == null) return opts.testEnv;
  return PRIVILEGED_NON_MFA_PATHS.has(path) || isMfaSessionPath(path);
}

/** Passkeys are a second factor: registering one needs a session that already passed MFA. */
export const PASSKEY_REGISTRATION_PATHS = new Set(["/passkey/generate-register-options", "/passkey/verify-registration"]);
