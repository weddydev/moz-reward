import { describe, expect, it } from "vitest";
import { privilegedSessionAllowed } from "./mfa";

describe("[P0-06] privileged session creation (audit security #1)", () => {
  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code", "/passkey/verify-authentication"])(
    "allows MFA path %s",
    (path) => expect(privilegedSessionAllowed(path, { testEnv: false })).toBe(true),
  );

  it("allows password sign-in (it becomes a 2FA challenge once TOTP is enrolled)", () => {
    expect(privilegedSessionAllowed("/sign-in/email", { testEnv: false })).toBe(true);
  });

  it.each(["/magic-link/verify", "/callback/google", "/oauth2/callback/google", "/sign-in/social", "/update-session", "/anything-else"])(
    "refuses non-MFA path %s for staff and admins",
    (path) => expect(privilegedSessionAllowed(path, { testEnv: false })).toBe(false),
  );

  it("allows internal session creation without a request path only in the test environment", () => {
    expect(privilegedSessionAllowed(undefined, { testEnv: true })).toBe(true);
    expect(privilegedSessionAllowed(undefined, { testEnv: false })).toBe(false);
    expect(privilegedSessionAllowed(null, { testEnv: false })).toBe(false);
  });
});
