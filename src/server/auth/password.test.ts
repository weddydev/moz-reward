import { describe, expect, it } from "vitest";
import { isMfaSessionPath } from "./mfa";
import { hashPassword, verifyPassword } from "./password";

describe("[P0-06] password hashing", () => {
  it("uses Argon2id and verifies only the right password", async () => {
    const h = await hashPassword("a-long-enough-password");
    expect(h.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword({ hash: h, password: "a-long-enough-password" })).resolves.toBe(
      true,
    );
    await expect(verifyPassword({ hash: h, password: "wrong-password-here" })).resolves.toBe(false);
  });
  it("treats malformed hashes as a mismatch", async () => {
    await expect(verifyPassword({ hash: "not-a-hash", password: "x" })).resolves.toBe(false);
  });
});

describe("[P0-06] isMfaSessionPath", () => {
  it("marks only second-factor and passkey endpoints", () => {
    expect(isMfaSessionPath("/two-factor/verify-totp")).toBe(true);
    expect(isMfaSessionPath("/passkey/verify-authentication")).toBe(true);
    expect(isMfaSessionPath("/sign-in/email")).toBe(false);
    expect(isMfaSessionPath("/magic-link/verify")).toBe(false);
    expect(isMfaSessionPath(undefined)).toBe(false);
  });
});
