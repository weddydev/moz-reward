import { describe, expect, it } from "vitest";
import {
  CLOSE_DISTANCE_RATIO,
  CLOSE_VELOCITY,
  dragOffset,
  releaseVelocity,
  shouldCloseSheet,
  type DragSample,
} from "./sheet-gesture";

describe("[P0-09] sheet close rule", () => {
  const height = 400;

  it("uses the AC 11 thresholds: 25% of the height, 0.5 px/ms", () => {
    expect(CLOSE_DISTANCE_RATIO).toBe(0.25);
    expect(CLOSE_VELOCITY).toBe(0.5);
  });

  it("closes when dragged down past 25% of its height, however slowly", () => {
    expect(shouldCloseSheet({ distance: 100, velocity: 0, height })).toBe(true);
    expect(shouldCloseSheet({ distance: 101, velocity: 0.01, height })).toBe(true);
  });

  it("springs back when dragged less than 25% slowly", () => {
    expect(shouldCloseSheet({ distance: 99, velocity: 0.49, height })).toBe(false);
    expect(shouldCloseSheet({ distance: 0, velocity: 0, height })).toBe(false);
  });

  it("closes on a downward flick faster than 0.5 px/ms, even a short one", () => {
    expect(shouldCloseSheet({ distance: 12, velocity: 0.51, height })).toBe(true);
    expect(shouldCloseSheet({ distance: 12, velocity: 0.5, height })).toBe(false);
  });

  it("never closes on an upward drag or flick", () => {
    expect(shouldCloseSheet({ distance: -50, velocity: -2, height })).toBe(false);
    // Fast upward flick that ends below the start: velocity is not downward, distance under 25%.
    expect(shouldCloseSheet({ distance: 30, velocity: -1, height })).toBe(false);
  });

  it("a flick needs a downward net distance (a jitter at the start is not a flick)", () => {
    expect(shouldCloseSheet({ distance: 0, velocity: 3, height })).toBe(false);
    expect(shouldCloseSheet({ distance: -4, velocity: 3, height })).toBe(false);
  });

  it("treats a missing or zero height as 'distance alone never closes'", () => {
    expect(shouldCloseSheet({ distance: 500, velocity: 0, height: 0 })).toBe(false);
    expect(shouldCloseSheet({ distance: 500, velocity: 1, height: 0 })).toBe(true);
    expect(shouldCloseSheet({ distance: Number.NaN, velocity: Number.NaN, height })).toBe(false);
  });
});

describe("[P0-09] release velocity", () => {
  const s = (y: number, t: number): DragSample => ({ y, t });

  it("is 0 with fewer than two samples", () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([s(10, 0)])).toBe(0);
  });

  it("measures the last ~100ms only, so a slow drag ending in a flick reads as a flick", () => {
    const samples = [s(0, 0), s(10, 400), s(20, 800), s(80, 900)];
    // Window: from the last sample at or before 800ms (t=800) to t=900: 60px / 100ms.
    expect(releaseVelocity(samples)).toBeCloseTo(0.6);
  });

  it("a drag that stopped before release has ~0 velocity", () => {
    const samples = [s(0, 0), s(150, 100), s(150, 300)];
    expect(releaseVelocity(samples)).toBe(0);
  });

  it("is negative when moving up", () => {
    expect(releaseVelocity([s(100, 0), s(40, 60)])).toBeCloseTo(-1);
  });

  it("ignores samples with no elapsed time", () => {
    expect(releaseVelocity([s(0, 50), s(30, 50)])).toBe(0);
  });
});

describe("[P0-09] drag offset", () => {
  it("follows the finger downwards", () => {
    expect(dragOffset(0)).toBe(0);
    expect(dragOffset(120)).toBe(120);
  });

  it("resists upward drags with growing friction and a hard cap", () => {
    const small = dragOffset(-16);
    const big = dragOffset(-400);
    expect(small).toBeLessThan(0);
    expect(small).toBeGreaterThan(-16);
    expect(big).toBeLessThan(small);
    expect(big).toBeGreaterThanOrEqual(-24);
    expect(dragOffset(-10_000)).toBe(-24);
  });
});
