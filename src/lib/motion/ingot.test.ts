import { describe, expect, it } from "vitest";
import { INGOT_BOX, levelY } from "@/lib/loyalty/ingot";
import {
  easeInOutQuad,
  levelAt,
  POUR,
  POUR_EASING,
  pourSteps,
  pourTimeline,
  timelineEnd,
} from "./ingot";

const y = (gold: number): number => levelY(gold / 1_000);

describe("[PD-10] pour easing (the reference's ease-in-out quad)", () => {
  it("is the reference's curve: 0, ½ at the middle, 1, symmetric", () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(0.25)).toBe(0.125);
    expect(easeInOutQuad(0.5)).toBe(0.5);
    expect(easeInOutQuad(0.75)).toBe(0.875);
    expect(easeInOutQuad(1)).toBe(1);
    expect(easeInOutQuad(-1)).toBe(0);
    expect(easeInOutQuad(2)).toBe(1);
  });

  it("as a CSS linear() easing, within 0.001 of the curve at every point", () => {
    expect(POUR_EASING.startsWith("linear(0,")).toBe(true);
    const points = POUR_EASING.slice("linear(".length, -1).split(",").map(Number);
    expect(points.length).toBeGreaterThanOrEqual(33);
    // Evenly spaced points: the linear interpolation between them never strays from the parabola by more than
    // h²/8 × max|f''| = h²/2.
    const h = 1 / (points.length - 1);
    for (let k = 0; k <= 1; k += 0.01) {
      const i = Math.min(points.length - 2, Math.floor(k / h));
      const t = (k - i * h) / h;
      const v = (points[i] ?? 0) * (1 - t) + (points[i + 1] ?? 0) * t;
      expect(Math.abs(v - easeInOutQuad(k))).toBeLessThan(0.001);
    }
  });

  it("levelAt: the gold shown at progress k of a pour", () => {
    expect(levelAt(720, 800, 0)).toBe(720);
    expect(levelAt(720, 800, 0.5)).toBe(760);
    expect(levelAt(720, 800, 1)).toBe(800);
    expect(levelAt(0, 720, 2)).toBe(720);
  });
});

describe("[PD-10] pour steps (what a change of gold plays)", () => {
  const at = (gold: number, ingots = 0) => ({ gold, ingots });

  it("adding gold pours it in 1 s; reaching the top fills in 1.5 s", () => {
    expect(pourSteps(at(720), at(800), 1_000)).toEqual([{ kind: "add", from: 720, to: 800 }]);
    expect(pourSteps(at(720), at(1_000), 1_000)).toEqual([{ kind: "fill", from: 720, to: 1_000 }]);
    expect(POUR.ms.add).toBe(1_000);
    expect(POUR.ms.fill).toBe(1_500);
  });

  it("multi-ingot overflow: fills to 100%, then the new ingot starts empty and takes the rest", () => {
    expect(pourSteps(at(900, 2), at(80, 3), 1_000)).toEqual([
      { kind: "fill", from: 900, to: 1_000 },
      { kind: "add", from: 0, to: 80, fresh: true },
    ]);
    // Exactly full and carried over to 0: the new ingot simply starts empty.
    expect(pourSteps(at(900, 2), at(0, 3), 1_000)).toEqual([
      { kind: "fill", from: 900, to: 1_000 },
      { kind: "drain", from: 0, to: 0, fresh: true },
    ]);
    // Two ingots at once still plays one fill (never a replay per ingot).
    expect(pourSteps(at(500, 0), at(300, 2), 1_000)).toHaveLength(2);
  });

  it("less gold (a new ingot reset, a correction) drains; no change plays nothing", () => {
    expect(pourSteps(at(1_000), at(720), 1_000)).toEqual([{ kind: "drain", from: 1_000, to: 720 }]);
    expect(pourSteps(at(720), at(720), 1_000)).toEqual([]);
  });

  it("is safe with nonsense (no size, NaN): nothing to play", () => {
    expect(pourSteps(at(0), at(500), 0)).toEqual([]);
    expect(pourSteps(at(0), at(Number.NaN), 1_000)).toEqual([]);
  });
});

describe("[PD-10] pour timeline (reference timing)", () => {
  const parts = (t: ReturnType<typeof pourTimeline>) => t.map((p) => p.part);

  it("first view: 200 ms after it shows, 0 → level in 900 ms with the stream; glint after; no stamp", () => {
    const t = pourTimeline({ kind: "pour", fromY: y(0), toY: y(720) }, POUR.view.delayMs);
    expect(parts(t)).toEqual(["fill", "stream", "glint"]);
    const fill = t.find((p) => p.part === "fill");
    expect(fill?.options).toMatchObject({ duration: 900, delay: 200, easing: POUR_EASING });
    expect(fill?.keyframes[0]?.transform).toBe(`translateY(${String(INGOT_BOX.bottom)}px)`);
    expect(fill?.keyframes.at(-1)?.transform).toBe(`translateY(${String(y(720))}px)`);
    // The stream fades in 220 ms (ease-out) as the pour ends; the glint crosses 460 px in 700 ms after it.
    const stream = t.find((p) => p.part === "stream");
    expect(stream?.options).toMatchObject({ duration: 900 + 220, delay: 200 });
    expect(stream?.keyframes.map((k) => k.opacity)).toEqual([1, 1, 0]);
    expect(stream?.keyframes[1]?.offset).toBeCloseTo(900 / 1_120, 6);
    const glint = t.find((p) => p.part === "glint");
    expect(glint?.options).toMatchObject({ duration: 700, delay: 1_100 });
    expect(glint?.keyframes.at(-1)?.transform).toBe("skewX(-20deg) translateX(460px)");
    expect(timelineEnd(t)).toBe(1_800);
  });

  it("later views: a 500 ms rise with no stream", () => {
    const t = pourTimeline({ kind: "rise", fromY: y(0), toY: y(720) }, POUR.view.delayMs);
    expect(parts(t)).toEqual(["fill", "glint"]);
    expect(t[0]?.options.duration).toBe(500);
  });

  it("adding gold: stream, '+N' stamp for 1.4 s from the start, glint after", () => {
    const t = pourTimeline({ kind: "add", fromY: y(720), toY: y(800) });
    expect(parts(t)).toEqual(["fill", "stream", "glint", "stamp"]);
    const stamp = t.find((p) => p.part === "stamp");
    expect(stamp?.options).toMatchObject({ duration: 1_400, delay: 0 });
    expect(stamp?.keyframes.map((k) => k.opacity)).toEqual([0, 1, 1, 0]);
    expect(stamp?.keyframes.map((k) => k.offset ?? null)).toEqual([null, 0.3, 0.8, null]);
  });

  it("drain: 600 ms ease-out, nothing else", () => {
    const t = pourTimeline({ kind: "drain", fromY: y(1_000), toY: y(720) });
    expect(parts(t)).toEqual(["fill"]);
    expect(t[0]?.options).toMatchObject({ duration: 600, easing: "cubic-bezier(.22,1,.36,1)" });
  });

  it("every part ends on its resting state; no forwards fill (finishing early lands on the static picture)", () => {
    for (const kind of ["pour", "rise", "add", "fill", "drain"] as const) {
      for (const part of pourTimeline({ kind, fromY: y(0), toY: y(500) }, 200)) {
        const last = part.keyframes.at(-1) ?? {};
        if (part.part === "fill") expect(last.transform).toBe(`translateY(${String(y(500))}px)`);
        if (part.part === "stream" || part.part === "stamp") expect(last.opacity).toBe(0);
        expect(part.options.fill === "backwards" || part.options.fill === "none").toBe(true);
      }
    }
  });
});
