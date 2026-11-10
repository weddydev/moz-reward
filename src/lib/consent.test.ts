import { describe, expect, it } from "vitest";
import { CONSENT_COOKIE, consentCookie, parseConsent, umamiScriptAttributes } from "./consent";

describe("[P0-13] analytics consent (COMPLIANCE §3, AC5)", () => {
  it("no decision until the visitor chooses; only this version's value counts", () => {
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("other=1")).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=analytics-v1-granted`)).toBe("granted");
    expect(parseConsent(`a=b; ${CONSENT_COOKIE}=analytics-v1-denied; c=d`)).toBe("denied");
    expect(parseConsent(`${CONSENT_COOKIE}=analytics-v0-granted`)).toBeNull(); // older wording: ask again
    expect(parseConsent(`${CONSENT_COOKIE}=granted`)).toBeNull();
  });

  it("the choice cookie: first-party, whole site, 6 months, Lax, Secure on https", () => {
    expect(consentCookie("denied", true)).toBe(
      `${CONSENT_COOKIE}=analytics-v1-denied; Path=/; Max-Age=15552000; SameSite=Lax; Secure`,
    );
    expect(consentCookie("granted", false)).toBe(
      `${CONSENT_COOKIE}=analytics-v1-granted; Path=/; Max-Age=15552000; SameSite=Lax`,
    );
  });

  it("Umami runs same-origin under its path, never sending query strings or fragments (C-26)", () => {
    expect(umamiScriptAttributes("/u", "0a3e5c1e-1111-4222-8333-444455556666")).toEqual({
      src: "/u/script.js",
      "data-website-id": "0a3e5c1e-1111-4222-8333-444455556666",
      "data-host-url": "/u",
      "data-exclude-search": "true",
      "data-exclude-hash": "true",
      "data-do-not-track": "true",
    });
  });
});
