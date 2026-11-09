import { describe, expect, it } from "vitest";
import { socialSignUpAllowed } from "./social";

describe("[P0-06] social sign-in: only verified emails create accounts", () => {
  it("refuses a Google user whose email Google has not verified", () => {
    expect(socialSignUpAllowed({ path: "/callback/google", emailVerified: false })).toBe(false);
    expect(socialSignUpAllowed({ path: "/callback/:id", emailVerified: false })).toBe(false);
  });

  it("allows a verified Google email", () => {
    expect(socialSignUpAllowed({ path: "/callback/google", emailVerified: true })).toBe(true);
  });

  it("does not interfere with other ways of creating users (magic link verifies by itself)", () => {
    expect(socialSignUpAllowed({ path: "/magic-link/verify", emailVerified: false })).toBe(true);
    expect(socialSignUpAllowed({ path: undefined, emailVerified: false })).toBe(true);
  });
});
