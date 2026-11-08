/** Endpoints that create a session only after a second factor (or a phishing-resistant passkey). */
const MFA_SESSION_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
  "/passkey/verify-authentication",
]);

export const isMfaSessionPath = (path: string | undefined | null): boolean =>
  path != null && MFA_SESSION_PATHS.has(path);
