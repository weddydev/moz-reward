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

  it("allows the magic link (it verifies the address itself) and internal creation without a request", () => {
    expect(socialSignUpAllowed({ path: "/magic-link/verify", emailVerified: false })).toBe(true);
    expect(socialSignUpAllowed({ path: undefined, emailVerified: false })).toBe(true);
  });

  it("denies unverified emails on every other path, incl. Google ID-token sign-in (review P0-B HIGH)", () => {
    for (const path of ["/sign-in/social", "/sign-up/email", "/oauth2/callback/x", "/anything"]) {
      expect(socialSignUpAllowed({ path, emailVerified: false }), path).toBe(false);
      expect(socialSignUpAllowed({ path, emailVerified: true }), path).toBe(true);
    }
  });
});

describe("[P0-06] Google authorisation request", () => {
  it("does not accept client-submitted ID tokens (no state/PKCE on that path)", async () => {
    // Better Auth refuses POST /sign-in/social with an idToken when the provider sets this option.
    const { google } = await import("better-auth/social-providers");
    const provider = google(googleProviderOptions({ clientId: "id", clientSecret: "secret" }));
    expect(provider.options.disableIdTokenSignIn).toBe(true);
  });

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
