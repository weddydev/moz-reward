import { describe, expect, it } from "vitest";
import { googleProviderOptions, socialSignUpAllowed } from "./social";

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

describe("[P0-06] Google authorisation request", () => {
  it("asks for openid, email and profile only, each once (SECURITY §2: least data)", async () => {
    const { google } = await import("better-auth/social-providers");
    const provider = google(googleProviderOptions({ clientId: "id", clientSecret: "secret" }));
    const url = await provider.createAuthorizationURL({
      state: "s",
      codeVerifier: "v".repeat(43),
      redirectURI: "http://localhost:3000/api/auth/callback/google",
    });
    const scopes = url.searchParams.get("scope")?.split(" ") ?? [];
    expect(scopes.toSorted()).toEqual(["email", "openid", "profile"]);
  });
});
