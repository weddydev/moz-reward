import { describe, expect, it } from "vitest";
import { EDGE, gildedEdge } from "./gilded-edge";

/** Numbers in a path string, in order. */
const nums = (d: string): number[] => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);

describe("[PD-02] gilded edge geometry (reference draw())", () => {
  it("[PD-02] corner arc, lines and gem for a 400×300 card with radius 26", () => {
    const g = gildedEdge(400, 300, 26);
    if (!g) throw new Error("no geometry");
    const R = 25; // radius − 1
    const rho = R - EDGE.offset;
    const k = rho * Math.SQRT1_2;
    const m = R - k;
    expect(g.viewBox).toBe("0 0 400 300");
    // Top line: from the arc midpoint over the arc to (R, o), then out to x = clamp(R+60, R+220, W·.42) = 168.
    expect(g.top).toBe(
      `M${String(m)} ${String(m)} A${String(rho)} ${String(rho)} 0 0 1 ${String(R)} 1.2 H168`,
    );
    // Left line: down to y = clamp(R+40, R+140, H·.45) = 135.
    expect(g.left).toBe(
      `M${String(m)} ${String(m)} A${String(rho)} ${String(rho)} 0 0 0 1.2 ${String(R)} V135`,
    );
    // Echo bottom-right: x to W − clamp(R+30, R+90, W·.18) = 400 − 72 = 328; y to H − clamp(R+24, R+70, H·.2) = 300 − 60.
    expect(nums(g.echoH).at(-1)).toBe(328);
    expect(nums(g.echoV).at(-1)).toBe(240);
    // Gem: a diamond of half-diagonal 8.5 centred on the arc midpoint; five facets.
    expect(g.facets).toHaveLength(5);
    const [x, y] = [m.toFixed(2), (m - 8.5).toFixed(2)];
    expect(g.rim.startsWith(`M${x} ${y} L`)).toBe(true);
  });

  it("[PD-02] the lines clamp: never shorter than R+60 / R+40, never longer than R+220 / R+140", () => {
    const wide = gildedEdge(2000, 1000, 26);
    const narrow = gildedEdge(120, 90, 26);
    if (!wide || !narrow) throw new Error("no geometry");
    expect(nums(wide.top).at(-1)).toBe(25 + 220);
    expect(nums(wide.left).at(-1)).toBe(25 + 140);
    expect(nums(narrow.top).at(-1)).toBe(25 + 60);
    expect(nums(narrow.left).at(-1)).toBe(25 + 40);
  });

  it("[PD-02] small radii use 10, unknown radius uses 20, an unmeasured card draws nothing", () => {
    const tiny = gildedEdge(200, 100, 4);
    const unknown = gildedEdge(200, 100, Number.NaN);
    if (!tiny || !unknown) throw new Error("no geometry");
    expect(nums(tiny.top)[7]).toBe(10); // the arc ends at x = R = max(10, 4 − 1)
    expect(nums(unknown.top)[7]).toBe(19);
    expect(gildedEdge(0, 100, 26)).toBeNull();
    expect(gildedEdge(100, 0, 26)).toBeNull();
  });

  it("[PD-02] the glint is a four-point star of size 10 just outside the gem centre", () => {
    const g = gildedEdge(400, 300, 26);
    if (!g) throw new Error("no geometry");
    const [gx, gy] = nums(g.glint);
    const m = 25 - (25 - EDGE.offset) * Math.SQRT1_2;
    expect(gx).toBeCloseTo(m - 2, 5);
    expect(gy).toBeCloseTo(m - 2 - 10, 5);
    expect(g.glint.match(/Q/g)).toHaveLength(4);
  });
});
