import { describe, expect, it } from "vitest";
import {
  MARKETING_CONSENT_VERSION,
  marketingConsentParts,
  marketingConsentText,
} from "./marketing-consent";

describe("[P1-04] marketing consent wording", () => {
  it("keeps the stored text of version 2026-11-17 byte for byte after the label/description split (P1-A DES-M3)", () => {
    expect(MARKETING_CONSENT_VERSION).toBe("2026-11-17");
    expect(marketingConsentText("Brew & Bloom Café")).toBe(
      "Get offers and news from Brew & Bloom Café? We'll send them in the app only, never by email. You can change this any time in the shop's settings.",
    );
    const { question, details } = marketingConsentParts("Brew & Bloom Café");
    expect(`${question} ${details}`).toBe(marketingConsentText("Brew & Bloom Café"));
    expect(question).toBe("Get offers and news from Brew & Bloom Café?");
  });
});
