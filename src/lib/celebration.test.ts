import { describe, expect, it } from "vitest";
import {
  announcement,
  CELEBRATION_WINDOW_MS,
  type Celebration,
  goldText,
  pickCelebration,
  progressLine,
  purchaseLine,
  shareText,
} from "./celebration";

const base: Celebration = {
  requestId: "r1",
  shop: { id: "s1", name: "Brew & Bloom Café", logoUrl: null, code: "BREW23" },
  gold: 80,
  amountPence: 840,
  ingot: { from: 720, to: 800, size: 1000, ingotsBefore: 0, filled: 0 },
  title: "Free coffee & cake",
  perVisit: 80,
  rewards: [],
  receipt: null,
};

describe("[P1-15] celebration copy", () => {
  it("[P1-15] says the gold, the shop and the purchase in UK English", () => {
    expect(goldText(80)).toBe("+80 gold");
    expect(goldText(1200)).toBe("+1,200 gold");
    expect(purchaseLine("Brew & Bloom Café", 840)).toBe("Brew & Bloom Café · £8.40 purchase");
    expect(purchaseLine("Brew & Bloom Café", null)).toBe("Brew & Bloom Café");
    expect(purchaseLine("Brew & Bloom Café", 0)).toBe("Brew & Bloom Café");
  });

  it("[P1-15] progress: percent full and visits to go, or gold to go when earned per £1", () => {
    expect(progressLine(base.ingot, 80)).toBe("80% full · about 3 more visits");
    expect(progressLine({ to: 950, size: 1000, filled: 0 }, 80)).toBe(
      "95% full · about 1 more visit",
    );
    expect(progressLine({ to: 800, size: 1000, filled: 0 }, null)).toBe(
      "80% full · 200 gold to go",
    );
    expect(progressLine({ to: 999, size: 1000, filled: 0 }, 0)).toBe("99% full · 1 gold to go");
  });

  it("[P1-15] progress after a fill names the next ingot; several fills are counted", () => {
    expect(progressLine({ to: 100, size: 1000, filled: 1 }, 80)).toBe(
      "Ingot filled · 10% into the next one",
    );
    expect(progressLine({ to: 0, size: 1000, filled: 2 }, 80)).toBe(
      "2 ingots filled · 0% into the next one",
    );
    // A full ingot without a fill (cannot normally happen: the engine fills at the size) still reads sensibly.
    expect(progressLine({ to: 1000, size: 1000, filled: 0 }, 80)).toBe(
      "100% full · your reward is ready",
    );
    // Out-of-range values are clamped, never "120%".
    expect(progressLine({ to: 1500, size: 1000, filled: 0 }, 80)).toBe(
      "100% full · your reward is ready",
    );
  });

  it("[P1-15] the live region carries everything the animation shows", () => {
    expect(announcement(base)).toBe(
      "+80 gold at Brew & Bloom Café. 80% full, about 3 more visits.",
    );
    expect(
      announcement({
        ...base,
        ingot: { ...base.ingot, to: 0, filled: 1 },
        rewards: [{ id: "w1", label: "Free coffee & cake", kind: "main" }],
      }),
    ).toBe(
      "+80 gold at Brew & Bloom Café. Ingot filled, 0% into the next one. Reward unlocked: Free coffee & cake.",
    );
    expect(
      announcement({
        ...base,
        rewards: [
          { id: "w1", label: "A", kind: "milestone" },
          { id: "w2", label: "B", kind: "main" },
        ],
      }),
    ).toMatch(/2 rewards unlocked\.$/);
  });

  it("[P1-15] the share text has no personal data", () => {
    expect(shareText(base)).toBe("I just collected 80 gold at Brew & Bloom Café with Moz Rewards.");
  });
});

describe("[P1-15] pickCelebration", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const at = (msAgo: number): Date => new Date(now.getTime() - msAgo);

  it("[P1-15] picks the newest approval with a snapshot inside the window", () => {
    const a = { id: "a", decidedAt: at(60_000), hasSnapshot: true };
    const b = { id: "b", decidedAt: at(10_000), hasSnapshot: true };
    const c = { id: "c", decidedAt: at(1_000), hasSnapshot: false };
    expect(pickCelebration([a, b, c], now)?.id).toBe("b");
  });

  it("[P1-15] nothing to play: none claimed, none with a snapshot, or all too old", () => {
    expect(pickCelebration([], now)).toBeNull();
    expect(pickCelebration([{ id: "x", decidedAt: at(0), hasSnapshot: false }], now)).toBeNull();
    expect(
      pickCelebration(
        [{ id: "old", decidedAt: at(CELEBRATION_WINDOW_MS + 1), hasSnapshot: true }],
        now,
      ),
    ).toBeNull();
    expect(
      pickCelebration(
        [{ id: "edge", decidedAt: at(CELEBRATION_WINDOW_MS), hasSnapshot: true }],
        now,
      )?.id,
    ).toBe("edge");
  });
});
