import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildParticles,
  GATE_COLOURS,
  gateEase,
  particleAt,
  sampleTargets,
  type GateParticle,
} from "./gate-particles";

/** A ring-and-disc alpha mask like the reference's offscreen canvas: an outer ring and an inner ring. */
function mask(size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const ring = Math.abs(d - (c - 5)) <= 3.5 || Math.abs(d - size * 0.4) <= 1.25;
      out[(y * size + x) * 4 + 3] = ring ? 255 : 0;
    }
  return out;
}

/** The parity harness's seeded Math.random (mulberry32, tests/parity/support/reference.ts). */
function seeded(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("[PD-09] sampleTargets (particles settle into the coin: ring + disc)", () => {
  it("returns 950 targets on full and 420 on lite, all inside the coin", () => {
    const m = mask(168);
    for (const [lite, n] of [
      [false, 950],
      [true, 420],
    ] as const) {
      const t = sampleTargets(m, 168, lite, seeded());
      expect(t).toHaveLength(n);
      for (const [x, y] of t) expect(Math.hypot(x, y)).toBeLessThanOrEqual(84);
    }
  });

  it("samples the ring every 2 px (3 on lite) and mixes in the disc points", () => {
    const m = mask(168);
    const full = sampleTargets(m, 168, false, seeded());
    // Ring points sit on the grid (even offsets from −84); disc points are random reals.
    const onGrid = full.filter(([x, y]) => Number.isInteger(x) && Number.isInteger(y));
    expect(onGrid.length).toBeGreaterThan(300);
    expect(onGrid.every(([x, y]) => (x + 84) % 2 === 0 && (y + 84) % 2 === 0)).toBe(true);
    const disc = full.filter(([x, y]) => !Number.isInteger(x) || !Number.isInteger(y));
    expect(disc.length).toBeGreaterThan(0);
    expect(disc.every(([x, y]) => Math.hypot(x, y) <= 168 * 0.37 + 1e-9)).toBe(true);
    const lite = sampleTargets(m, 168, true, seeded());
    const liteGrid = lite.filter(([x, y]) => Number.isInteger(x) && Number.isInteger(y));
    expect(liteGrid.every(([x, y]) => (x + 84) % 3 === 0 && (y + 84) % 3 === 0)).toBe(true);
  });

  it("is deterministic for a given random source (parity seeds Math.random)", () => {
    const m = mask(168);
    expect(sampleTargets(m, 168, false, seeded(7))).toEqual(
      sampleTargets(m, 168, false, seeded(7)),
    );
    expect(sampleTargets(m, 168, false, seeded(7))).not.toEqual(
      sampleTargets(m, 168, false, seeded(8)),
    );
  });

  it("draws random numbers in the reference's order (disc angle, then radius; then the shuffle)", () => {
    const m = new Uint8ClampedArray(4 * 4 * 4); // empty mask: every target is a disc point
    const calls: number[] = [];
    let i = 0;
    const rng = (): number => {
      const v = [0.25, 0.81][i++ % 2] ?? 0;
      calls.push(v);
      return v;
    };
    const t = sampleTargets(m, 4, true, rng);
    // 160 disc points (2 draws each) + a Fisher–Yates shuffle of 160 (159 draws).
    expect(calls).toHaveLength(160 * 2 + 159);
    const [x, y] = t[0] ?? [0, 0];
    expect(Math.hypot(x, y)).toBeCloseTo(Math.sqrt(0.81) * 4 * 0.37, 9);
  });
});

describe("[PD-09] buildParticles", () => {
  it("gives each target a start radius, spiral, delay, duration, size and colour in the reference's ranges", () => {
    const targets = sampleTargets(mask(168), 168, false, seeded());
    const big = 844;
    const ps = buildParticles(targets, big, seeded(3));
    expect(ps).toHaveLength(targets.length);
    for (const p of ps) {
      expect(p.r0).toBeGreaterThanOrEqual(big * 0.55);
      expect(p.r0).toBeLessThanOrEqual(big);
      const turns = Math.abs(p.spin) / Math.PI;
      expect(turns).toBeGreaterThanOrEqual(2.2);
      expect(turns).toBeLessThanOrEqual(3.8);
      expect(p.delay).toBeGreaterThanOrEqual(0);
      expect(p.delay).toBeLessThan(300);
      expect(p.dur).toBeGreaterThanOrEqual(620);
      expect(p.dur).toBeLessThanOrEqual(960);
      expect(p.s).toBeGreaterThanOrEqual(0.8);
      expect(p.s).toBeLessThanOrEqual(2.4);
      expect(GATE_COLOURS).toContain(p.c);
    }
    const glowing = ps.filter((p) => p.g).length / ps.length;
    expect(glowing).toBeGreaterThan(0.03);
    expect(glowing).toBeLessThan(0.15);
  });

  it("uses eight random draws per particle (the spiral takes two), in the reference's property order", () => {
    const calls: number[] = [];
    const rng = (): number => {
      calls.push(0.5);
      return 0.5;
    };
    const [p] = buildParticles([[3, 4]], 100, rng);
    expect(calls).toHaveLength(8);
    expect(p).toMatchObject({ tr: 5, r0: 77.5, delay: 150, dur: 790, s: 1.6, g: false });
    expect(p?.spin).toBeCloseTo(-3 * Math.PI, 12); // 0.5 is not < .5: anticlockwise
    expect(p?.c).toBe(GATE_COLOURS[3]);
  });
});

describe("[PD-09] particleAt (the spiral in)", () => {
  const p: GateParticle = {
    tr: 40,
    ta: 0.5,
    r0: 600,
    spin: 3 * Math.PI,
    delay: 100,
    dur: 800,
    s: 1,
    c: "#FFE08A",
    g: false,
  };

  it("is absent before its start (300 ms + its delay)", () => {
    expect(particleAt(p, 399, 200, 300)).toBeNull();
    expect(particleAt(p, 400, 200, 300)).not.toBeNull();
  });

  it("starts on its outer radius at alpha .55 and lands on its target at alpha 1", () => {
    const a = particleAt(p, 400, 200, 300);
    expect(Math.hypot((a?.x ?? 0) - 200, (a?.y ?? 0) - 300)).toBeCloseTo(600, 6);
    expect(a?.alpha).toBeCloseTo(0.55, 9);
    const b = particleAt(p, 1200, 200, 300);
    expect(b?.x).toBeCloseTo(200 + Math.cos(0.5) * 40, 9);
    expect(b?.y).toBeCloseTo(300 + Math.sin(0.5) * 40, 9);
    expect(b?.alpha).toBe(1);
    // Settled: it stays on its target.
    expect(particleAt(p, 1800, 200, 300)).toEqual(b);
  });

  it("eases in-out (cubic), symmetric about the middle", () => {
    expect(gateEase(0)).toBe(0);
    expect(gateEase(1)).toBe(1);
    expect(gateEase(0.5)).toBeCloseTo(0.5, 12);
    expect(gateEase(0.25) + gateEase(0.75)).toBeCloseTo(1, 12);
    expect(gateEase(0.25)).toBeCloseTo(0.0625, 12);
  });
});

describe("[PD-09] the helpers can be inlined (no outside references)", () => {
  it("each runs from its own source in a bare context", () => {
    const run = (fn: (...a: never[]) => unknown, call: string): unknown =>
      runInNewContext(`(${fn.toString()})${call}`, { Math });
    expect(run(gateEase, "(0.5)")).toBeCloseTo(0.5, 12);
    const at = run(
      particleAt,
      `({tr:0,ta:0,r0:10,spin:1,delay:0,dur:100,s:1,c:"gold",g:false},1000,5,5)`,
    ) as { x: number } | null;
    expect(at?.x).toBeCloseTo(5, 9);
    const ts = run(sampleTargets, "(new Uint8ClampedArray(64),4,true,Math.random)");
    expect(ts).toHaveLength(160);
    const ps = run(buildParticles, "([[1,1]],100,Math.random)");
    expect(ps).toHaveLength(1);
  });
});
