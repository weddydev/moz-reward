import { describe, expect, it } from "vitest";
import { privilegedRequestAllowed, privilegedSessionAllowed } from "./mfa";

describe("[P0-06] privileged session creation (audit security #1)", () => {
  it.each([
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/passkey/verify-authentication",
  ])("allows MFA path %s", (path) => {
    expect(privilegedSessionAllowed(path, { testEnv: false })).toBe(true);
  });

  it("allows password sign-in (it becomes a 2FA challenge once TOTP is enrolled)", () => {
    expect(privilegedSessionAllowed("/sign-in/email", { testEnv: false })).toBe(true);
  });

  it("allows change-password to re-issue the caller's session (non-MFA)", () => {
    expect(privilegedSessionAllowed("/change-password", { testEnv: false })).toBe(true);
  });

  it.each([
    "/magic-link/verify",
    "/callback/google",
    "/oauth2/callback/google",
    "/sign-in/social",
    "/update-session",
    "/anything-else",
  ])("refuses non-MFA path %s for staff and admins", (path) => {
    expect(privilegedSessionAllowed(path, { testEnv: false })).toBe(false);
  });

  it("allows internal session creation without a request path only in the test environment", () => {
    expect(privilegedSessionAllowed(undefined, { testEnv: true })).toBe(true);
    expect(privilegedSessionAllowed(undefined, { testEnv: false })).toBe(false);
    expect(privilegedSessionAllowed(null, { testEnv: false })).toBe(false);
  });
});

describe("[P0-07] Better Auth endpoints for staff/admin sessions (audit security #8)", () => {
  const HOUR = 3_600_000;
  const fresh = { mfaVerified: true, sessionAgeMs: HOUR, maxAgeMs: 12 * HOUR };

  it("an MFA-verified session within its role's limit may use account endpoints", () => {
    for (const path of [
      "/list-sessions",
      "/revoke-other-sessions",
      "/update-user",
      "/passkey/verify-registration",
    ]) {
      expect(privilegedRequestAllowed({ path, ...fresh }), path).toBe(true);
    }
  });

  it("a password-only session may only enrol a second factor, change its password, or sign out", () => {
    const pwOnly = { ...fresh, mfaVerified: false };
    for (const path of [
      "/two-factor/enable",
      "/two-factor/verify-totp",
      "/two-factor/get-totp-uri",
      "/change-password",
      "/sign-out",
      "/get-session",
    ]) {
      expect(privilegedRequestAllowed({ path, ...pwOnly }), path).toBe(true);
    }
    for (const path of [
      "/list-sessions",
      "/revoke-other-sessions",
      "/revoke-session",
      "/update-user",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/delete-user",
    ]) {
      expect(privilegedRequestAllowed({ path, ...pwOnly }), path).toBe(false);
    }
  });

  it("a session past its role's limit (staff 12 h, admin 2 h) may only sign out or read itself", () => {
    const stale = { mfaVerified: true, sessionAgeMs: 12 * HOUR + 1, maxAgeMs: 12 * HOUR };
    expect(privilegedRequestAllowed({ path: "/sign-out", ...stale })).toBe(true);
    expect(privilegedRequestAllowed({ path: "/get-session", ...stale })).toBe(true);
    for (const path of [
      "/list-sessions",
      "/update-user",
      "/two-factor/enable",
      "/change-password",
    ]) {
      expect(privilegedRequestAllowed({ path, ...stale }), path).toBe(false);
    }
    for (const path of [
      "/sign-in/email",
      "/two-factor/verify-totp",
      "/callback/google",
      "/magic-link/verify",
    ]) {
      expect(privilegedRequestAllowed({ path, ...stale }), `sign in again: ${path}`).toBe(true);
    }
    const adminStale = { mfaVerified: true, sessionAgeMs: 2 * HOUR + 1, maxAgeMs: 2 * HOUR };
    expect(privilegedRequestAllowed({ path: "/list-sessions", ...adminStale })).toBe(false);
  });
});
