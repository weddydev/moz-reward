import { afterEach, describe, expect, it } from "vitest";
import { HERO_TTL_MS, clearHero, peekHero, setHero } from "./hero-handoff";

const BASE = "https://moz.test/wallet";
const BREW = { id: "brew", name: "Brew & Bloom Café", imageUrl: "https://cdn.test/brew.png" };

describe("[P1-07] hero handoff: a tapped card's identity reaches the next page's loading state", () => {
  afterEach(() => {
    clearHero();
  });

  it("hands the card's identity to the page it pointed at, for as long as that page loads", () => {
    setHero("/shops/brew?x=1#top", BREW, 1000, BASE);
    expect(peekHero("/shops/brew", 1100)).toEqual(BREW);
    // Not consumed: a fallback rendered twice shows the same header both times.
    expect(peekHero("/shops/brew", 1200)).toEqual(BREW);
  });

  it("resolves relative links against the current page", () => {
    setHero("shops/brew", BREW, 1000, "https://moz.test/");
    expect(peekHero("/shops/brew", 1000)).toEqual(BREW);
  });

  it("gives nothing to a different page (second click won, typed URL, browser back)", () => {
    setHero("/shops/brew", BREW, 1000, BASE);
    expect(peekHero("/shops/other", 1100)).toBeNull();
  });

  it("expires, so a click that never navigated can't dress a later visit", () => {
    setHero("/shops/brew", BREW, 1000, BASE);
    expect(peekHero("/shops/brew", 1000 + HERO_TTL_MS + 1)).toBeNull();
  });

  it("the second click wins", () => {
    setHero("/shops/brew", BREW, 1000, BASE);
    setHero("/shops/nan", { id: "nan", name: "Nan's Bakery", imageUrl: null }, 1050, BASE);
    expect(peekHero("/shops/brew", 1100)).toBeNull();
    expect(peekHero("/shops/nan", 1100)).toEqual({
      id: "nan",
      name: "Nan's Bakery",
      imageUrl: null,
    });
  });

  it("ignores another origin and an unparsable link", () => {
    setHero("https://evil.test/shops/brew", BREW, 1000, BASE);
    expect(peekHero("/shops/brew", 1000)).toBeNull();
    setHero("http://[bad", BREW, 1000, BASE);
    expect(peekHero("/shops/brew", 1000)).toBeNull();
  });

  it("an unrecorded handoff (full page load) gives nothing", () => {
    expect(peekHero("/shops/brew", 1000)).toBeNull();
  });
});
