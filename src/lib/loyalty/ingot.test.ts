import { describe, expect, it } from "vitest";
import { INGOT_BOX, ingotFill, ingotPercent, levelY, mouldRightX } from "./ingot";

describe("[P1-08] ingot fill", () => {
  it("0 / 50 / 99 / 100 / overflow", () => {
    expect(ingotFill(0, 1_000)).toMatchObject({
      fraction: 0,
      percent: 0,
      label: "0 of 1,000 gold, 0%",
    });
    expect(ingotFill(500, 1_000)).toMatchObject({ fraction: 0.5, percent: 50 });
    // 999 reads 99% (never a full ingot that isn't), but the picture is nearly full.
    expect(ingotFill(999, 1_000)).toMatchObject({ fraction: 0.999, percent: 99 });
    expect(ingotFill(1_000, 1_000)).toMatchObject({
      fraction: 1,
      percent: 100,
      label: "1,000 of 1,000 gold, 100%",
    });
    // More than the ingot holds: a full ingot, never "120%" or "1,200 of 1,000".
    expect(ingotFill(1_200, 1_000)).toMatchObject({
      fraction: 1,
      percent: 100,
      gold: 1_000,
      label: "1,000 of 1,000 gold, 100%",
    });
  });

  it("reads the DESIGN sample as 720 of 1,000 gold, 72%", () => {
    expect(ingotFill(720, 1_000).label).toBe("720 of 1,000 gold, 72%");
  });

  it("is safe with nonsense input (no size, negative, fractional, NaN)", () => {
    expect(ingotFill(500, 0)).toMatchObject({ fraction: 0, percent: 0, gold: 0 });
    expect(ingotFill(-5, 1_000)).toMatchObject({ fraction: 0, gold: 0 });
    expect(ingotFill(Number.NaN, 1_000)).toMatchObject({ fraction: 0, gold: 0 });
    expect(ingotFill(250.9, 1_000)).toMatchObject({ gold: 250, percent: 25 });
    expect(ingotPercent(1, 3)).toBe(33);
  });

  it("[PD-10] maps fill to the front face's height (reference: 182 − 120 × fill); clamped", () => {
    expect(INGOT_BOX).toMatchObject({ width: 320, height: 210, top: 40, faceTop: 62, bottom: 182 });
    expect(levelY(0)).toBe(INGOT_BOX.bottom);
    expect(levelY(1)).toBe(INGOT_BOX.faceTop);
    expect(levelY(0.72)).toBeCloseTo(95.6, 6);
    expect(levelY(0.5)).toBe((INGOT_BOX.bottom + INGOT_BOX.faceTop) / 2);
    expect(levelY(2)).toBe(INGOT_BOX.faceTop);
    expect(levelY(-1)).toBe(INGOT_BOX.bottom);
  });

  it("[PD-10] follows the reference mould's right edge for milestone ticks", () => {
    expect(mouldRightX(INGOT_BOX.top)).toBe(236);
    expect(mouldRightX(INGOT_BOX.faceTop)).toBe(250);
    expect(mouldRightX(INGOT_BOX.bottom)).toBe(292);
    expect(mouldRightX(122)).toBe(271);
  });
});
