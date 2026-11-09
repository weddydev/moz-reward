import { createCookieGetter, getCookies } from "better-auth/cookies";
import { describe, expect, it } from "vitest";
import { authCookieOptions } from "./cookies";

// Every cookie Better Auth or a plugin we use can set (core, two-factor, passkey, OAuth state, magic link).
const COOKIE_KEYS = [
  "session_token",
  "session_data",
  "dont_remember",
  "two_factor",
  "passkey",
  "state",
  "account_data",
];

const cookiesFor = (url: string) => {
  const create = createCookieGetter({ baseURL: url, advanced: authCookieOptions(url) });
  return COOKIE_KEYS.map((key) => create(key));
};

describe("[P0-06] auth cookies (SECURITY §2)", () => {
  it("on https every auth cookie is __Host-: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain", () => {
    for (const cookie of cookiesFor("https://staging.example.co.uk")) {
      expect(cookie.name).toMatch(/^__Host-moz\./);
      expect(cookie.name).not.toContain("__Secure-");
      expect(cookie.attributes).toMatchObject({
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      expect(cookie.attributes.domain).toBeUndefined();
    }
  });

  it("the session cookie Better Auth reads back has the same __Host- name", () => {
    const url = "https://moz.example";
    const { sessionToken } = getCookies({ baseURL: url, advanced: authCookieOptions(url) });
    expect(sessionToken.name).toBe("__Host-moz.session_token");
  });

  it("on plain-http local/test servers cookies keep a plain prefix (browsers drop __Host- without Secure)", () => {
    for (const cookie of cookiesFor("http://localhost:3000")) {
      expect(cookie.name).toMatch(/^moz\./);
      expect(cookie.attributes).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax" });
    }
  });
});
