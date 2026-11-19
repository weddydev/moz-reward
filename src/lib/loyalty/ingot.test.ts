import { describe, expect, it } from "vitest";
import { POUR_MS, pourTimeline, timelineEnd } from "@/lib/motion/ingot";
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

  it("maps fill to the front face's height; the top face fills only at 100%; clamped", () => {
    expect(levelY(0)).toBe(INGOT_BOX.bottom);
    expect(levelY(1)).toBe(INGOT_BOX.top);
    expect(levelY(0.5)).toBe((INGOT_BOX.bottom + INGOT_BOX.faceTop) / 2);
    expect(levelY(0.999)).toBeGreaterThan(INGOT_BOX.faceTop);
    expect(levelY(2)).toBe(INGOT_BOX.top);
    expect(levelY(-1)).toBe(INGOT_BOX.bottom);
  });

  it("follows the mould's right edge for milestone ticks", () => {
    expect(mouldRightX(INGOT_BOX.top)).toBe(174);
    expect(mouldRightX(INGOT_BOX.faceTop)).toBe(192);
    expect(mouldRightX(INGOT_BOX.bottom)).toBe(226);
    expect(mouldRightX(82)).toBeCloseTo(209, 0);
  });
});

describe("[P1-08] pour timeline", () => {
  it("pour is 0.9 s with a stream; rise is 0.5 s without one", () => {
    const pour = pourTimeline("pour", levelY(0.72));
    const rise = pourTimeline("rise", levelY(0.72));
    expect(timelineEnd(pour)).toBe(POUR_MS.pour);
    expect(timelineEnd(rise)).toBe(POUR_MS.rise);
    expect(pour.map((p) => p.part)).toContain("stream");
    expect(rise.map((p) => p.part)).not.toContain("stream");
  });

  it("starts the liquid empty and ends it at the level the static picture draws", () => {
    const level = levelY(0.72);
    for (const kind of ["pour", "rise"] as const) {
      const fill = pourTimeline(kind, level).find((p) => p.part === "fill");
      expect(fill?.keyframes[0]?.transform).toBe(`translate(0px, ${String(INGOT_BOX.bottom)}px)`);
      expect(fill?.keyframes.at(-1)?.transform).toBe(`translate(0px, ${String(level)}px)`);
    }
  });

  it("ends every part on its resting state (finishing early never leaves a half pour)", () => {
    for (const kind of ["pour", "rise"] as const) {
      for (const part of pourTimeline(kind, 50)) {
        const last = part.keyframes.at(-1) ?? {};
        if (part.part === "wave") expect(last.transform).toBe("translateX(0px) scaleY(1)");
        if (part.part === "glint" || part.part === "stream") expect(last.opacity).toBe(0);
        // No forwards fill: once finished, the element shows its own (static) attributes.
        expect(part.options.fill).toBe("backwards");
      }
    }
  });
});
