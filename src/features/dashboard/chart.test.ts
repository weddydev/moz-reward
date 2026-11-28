import { describe, expect, it } from "vitest";
import { barHeights, MIN_BAR_PCT } from "./chart";

describe("[P2-01] weekly visits chart scale", () => {
  it("scales each bar to the busiest day (100%)", () => {
    expect(barHeights([24, 31, 28, 36, 40, 47, 42])).toEqual([
      51.1, 66, 59.6, 76.6, 85.1, 100, 89.4,
    ]);
  });

  it("a new shop with no visits draws flat zero bars, never NaN", () => {
    const h = barHeights([0, 0, 0, 0, 0, 0, 0]);
    expect(h).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(h.some(Number.isNaN)).toBe(false);
  });

  it("a day with a few visits on a busy week stays visible (minimum height); a zero day stays at 0", () => {
    const h = barHeights([0, 1, 1000]);
    expect(h[0]).toBe(0);
    expect(h[1]).toBe(MIN_BAR_PCT);
    expect(h[2]).toBe(100);
  });

  it("negative or non-finite inputs draw as 0 (defensive: visits can't be negative)", () => {
    expect(barHeights([-3, Number.NaN, 4])).toEqual([0, 0, 100]);
  });

  it("an empty series is empty", () => {
    expect(barHeights([])).toEqual([]);
  });
});
