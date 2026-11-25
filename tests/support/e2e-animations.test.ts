import { describe, expect, it } from "vitest";
import {
  animates,
  fromValue,
  moves,
  rotationOf,
  scaleOf,
  snapshotEffect,
  toValue,
  translateOf,
  type StartedAnimation,
} from "../e2e/support/animations";

const effect = (keyframes: object[], timing: object) => ({
  getKeyframes: () => keyframes,
  getTiming: () => timing,
});

const anim = (keyframes: StartedAnimation["keyframes"]): StartedAnimation => ({
  seq: 0,
  source: "script",
  name: "",
  target: "div",
  keyframes,
  timing: snapshotEffect(null).timing,
  startedAt: 0,
  state: "running",
});

describe("[P1-19] snapshotEffect: the same plain keyframes and timing on every engine", () => {
  it("[P1-19] keeps string, number and null keyframe values and drops anything not serialisable", () => {
    const out = snapshotEffect(
      effect(
        [
          {
            offset: null,
            computedOffset: 0,
            easing: "ease-out",
            composite: "auto",
            transform: "scale(.5)",
          },
          {
            offset: 1,
            computedOffset: 1,
            transform: "none",
            opacity: 1,
            weird: { a: 1 },
            fn: () => 1,
          },
        ],
        {
          duration: 620,
          delay: 110,
          endDelay: 0,
          easing: "cubic-bezier(.2,.8,.2,1)",
          fill: "both",
        },
      ),
    );
    expect(out.keyframes).toEqual([
      {
        offset: null,
        computedOffset: 0,
        easing: "ease-out",
        composite: "auto",
        transform: "scale(.5)",
      },
      { offset: 1, computedOffset: 1, transform: "none", opacity: 1 },
    ]);
    expect(out.timing).toEqual({
      duration: 620,
      delay: 110,
      endDelay: 0,
      easing: "cubic-bezier(.2,.8,.2,1)",
      fill: "both",
      iterations: 1,
      direction: "normal",
    });
  });

  it("[P1-19] reads a script animation given no duration ('auto') as 0 ms and keeps infinite iterations", () => {
    const { timing } = snapshotEffect(
      effect([], { duration: "auto", iterations: Infinity, easing: "" }),
    );
    expect(timing.duration).toBe(0);
    expect(timing.iterations).toBe(Infinity);
    expect(timing.easing).toBe("linear");
    expect(timing.fill).toBe("auto");
  });

  it("[P1-19] an animation without an effect has no keyframes and default timing (never throws)", () => {
    expect(snapshotEffect(null)).toEqual({
      keyframes: [],
      timing: {
        duration: 0,
        delay: 0,
        endDelay: 0,
        easing: "linear",
        fill: "auto",
        iterations: 1,
        direction: "normal",
      },
    });
    expect(snapshotEffect({}).keyframes).toEqual([]);
    expect(snapshotEffect(effect([], { duration: Number.NaN })).timing.duration).toBe(0);
  });
});

describe("[P1-19] keyframe readers", () => {
  const a = anim([
    { computedOffset: 0, opacity: 0 },
    { computedOffset: 0.4, transform: "translateY(8px) scale(.96)" },
    { computedOffset: 1, transform: "none", opacity: 1 },
  ]);

  it("[P1-19] from/to read the first and last keyframe that set the property", () => {
    expect(fromValue(a, "transform")).toBe("translateY(8px) scale(.96)");
    expect(toValue(a, "transform")).toBe("none");
    expect(fromValue(a, "opacity")).toBe(0);
    expect(toValue(a, "opacity")).toBe(1);
    expect(fromValue(a, "clipPath")).toBeUndefined();
    expect(animates(a, "clipPath")).toBe(false);
    expect(animates(a, "opacity")).toBe(true);
  });

  it("[P1-19] moves: a transform, translate, scale or rotate other than none; a fade alone does not move", () => {
    expect(moves(a)).toBe(true);
    expect(moves(anim([{ opacity: 0 }, { opacity: 1 }]))).toBe(false);
    expect(moves(anim([{ transform: "none" }, { transform: "none" }]))).toBe(false);
    expect(moves(anim([{ rotate: "0deg" }, { rotate: "180deg" }]))).toBe(true);
  });
});

describe("[P1-19] scaleOf / translateOf over transform lists", () => {
  it.each([
    ["none", 1],
    ["", 1],
    [null, 1],
    ["scale(.5)", 0.5],
    ["scale(0.92, 0.92)", 0.92],
    ["scaleX(0)", 0],
    ["scale3d(.7, .7, 1)", 0.7],
    ["translateY(24px) scale(.96)", 0.96],
    ["translateX(42px) translateY(0) scale(.7)", 0.7],
    ["scale(.5) scale(.5)", 0.25],
    ["translateY(-14px) rotate(-4deg)", 1],
    ["matrix(0.5, 0, 0, 0.5, 10, 20)", 0.5],
    ["matrix(0, 1, -1, 0, 0, 0)", 1],
    ["matrix3d(0.8, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 1, 0, 3, 4, 0, 1)", 0.8],
    ["0.9", 0.9],
    ["0.9 1", 0.9],
  ] as const)("[P1-19] scaleOf(%j) = %d", (t, s) => {
    expect(scaleOf(t)).toBeCloseTo(s, 6);
  });

  it("[P1-19] an unreadable scale is NaN, never a silent 1", () => {
    expect(scaleOf("scale(var(--k))")).toBeNaN();
  });

  it.each([
    ["none", { x: 0, y: 0 }],
    ["translateY(8px)", { x: 0, y: 8 }],
    ["translate(3px, -4px)", { x: 3, y: -4 }],
    ["translate(5px)", { x: 5, y: 0 }],
    ["translateX(92px) translateY(-12px) scale(1)", { x: 92, y: -12 }],
    ["matrix(1, 0, 0, 1, 10, 20)", { x: 10, y: 20 }],
    ["matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 0, 1)", { x: 3, y: 4 }],
  ] as const)("[P1-19] translateOf(%j)", (t, xy) => {
    expect(translateOf(t)).toEqual(xy);
  });
});

describe("[P1-19] rotationOf", () => {
  it.each([
    ["none", 0],
    ["translateX(-50%) rotate(-28deg)", -28],
    ["rotate(0.5turn)", 180],
    ["rotateZ(3.14159265rad)", 180],
    ["scale(1) rotate(-4deg)", -4],
    ["matrix(0.8829476, -0.4694716, 0.4694716, 0.8829476, -18, 0)", -28],
    ["matrix3d(0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)", 90],
  ] as const)("[P1-19] rotationOf(%j) = %d°", (t, deg) => {
    expect(rotationOf(t)).toBeCloseTo(deg, 4);
  });
});
