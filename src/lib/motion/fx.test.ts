import { describe, expect, it } from "vitest";
import {
  alphaOf,
  burst,
  capFor,
  createRng,
  FX,
  fxStats,
  type Particle,
  type ParticleType,
  spawn,
  step,
} from "./fx";

const full = (seed = 1): { lite: boolean; rng: () => number } => ({
  lite: false,
  rng: createRng(seed),
});
const lite = (seed = 1): { lite: boolean; rng: () => number } => ({
  lite: true,
  rng: createRng(seed),
});
const speedOf = (p: Particle): number => Math.hypot(p.vx, p.vy);

describe("[PD-03] FX engine: spawn (DESIGN §7.4 FX engine)", () => {
  it("[PD-03] 20 particles by default, half on lite; the count option scales the same way", () => {
    expect(spawn([], 0, 0, {}, full())).toBe(20);
    expect(spawn([], 0, 0, {}, lite())).toBe(10);
    expect(spawn([], 0, 0, { count: 28 }, full())).toBe(28);
    expect(spawn([], 0, 0, { count: 28 }, lite())).toBe(14);
    expect(spawn([], 0, 0, { count: 7 }, lite())).toBe(4); // Math.round(3.5)
    expect(spawn([], 0, 0, { count: 0 }, full())).toBe(0);
  });

  it("[PD-03] never past the cap: 420 full, 160 lite, across bursts", () => {
    const parts: Particle[] = [];
    for (let i = 0; i < 40; i++) spawn(parts, 0, 0, { count: 28 }, full(i));
    expect(parts).toHaveLength(FX.cap.full);
    expect(spawn(parts, 0, 0, {}, full())).toBe(0);
    const liteParts: Particle[] = [];
    for (let i = 0; i < 40; i++) spawn(liteParts, 0, 0, { count: 28 }, lite(i));
    expect(liteParts).toHaveLength(FX.cap.lite);
    expect(capFor(true)).toBe(160);
    expect(capFor(false)).toBe(420);
  });

  it.each<[ParticleType, number, number, readonly [number, number]]>([
    ["spark", 520, 0.975, [0.45, 0.9]],
    ["coin", 1100, 0.975, [1.1, 1.7]],
    ["leaf", 60, 0.985, [2.2, 3.4]],
  ])("[PD-03] %s: gravity %d, drag %d, life in range, speed in the default range", (type, g, drag, life) => {
    const parts: Particle[] = [];
    spawn(parts, 100, 200, { type, count: 400 }, full(7));
    expect(parts).toHaveLength(400);
    for (const p of parts) {
      expect(p.type).toBe(type);
      expect(p.g).toBe(g);
      expect(p.drag).toBe(drag);
      expect(p.life).toBeGreaterThanOrEqual(life[0]);
      expect(p.life).toBeLessThanOrEqual(life[1]);
      expect(p.max).toBe(p.life);
      expect(speedOf(p)).toBeGreaterThanOrEqual(150 - 1e-9);
      expect(speedOf(p)).toBeLessThanOrEqual(420 + 1e-9);
      expect(p.size).toBeGreaterThanOrEqual(FX.size[type][0]);
      expect(p.size).toBeLessThanOrEqual(FX.size[type][1]);
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    }
  });

  it("[PD-03] options: speed range, gravity, life, jitter and a narrow spread around the angle", () => {
    const parts: Particle[] = [];
    spawn(
      parts,
      50,
      60,
      {
        type: "coin",
        count: 200,
        speed: [260, 520],
        angle: -Math.PI / 2,
        spread: 1.6,
        gravity: 10,
        life: [1, 2],
        jx: 5,
        jy: 3,
      },
      full(3),
    );
    for (const p of parts) {
      expect(speedOf(p)).toBeGreaterThanOrEqual(260 - 1e-9);
      expect(speedOf(p)).toBeLessThanOrEqual(520 + 1e-9);
      expect(p.g).toBe(10);
      expect(p.life).toBeGreaterThanOrEqual(1);
      expect(p.life).toBeLessThanOrEqual(2);
      expect(Math.abs(p.x - 50)).toBeLessThanOrEqual(5);
      expect(Math.abs(p.y - 60)).toBeLessThanOrEqual(3);
      const a = Math.atan2(p.vy, p.vx);
      expect(Math.abs(a + Math.PI / 2)).toBeLessThanOrEqual(0.8 + 1e-9);
    }
    // A full-turn spread (the default) sends particles every way, some of them down.
    const round: Particle[] = [];
    spawn(round, 0, 0, { count: 200 }, full(4));
    expect(round.some((p) => p.vy > 0)).toBe(true);
    expect(round.some((p) => p.vy < 0)).toBe(true);
  });

  it("[PD-03] a seed makes a burst repeatable; another seed changes it", () => {
    const a: Particle[] = [];
    const b: Particle[] = [];
    const c: Particle[] = [];
    spawn(a, 10, 10, { type: "leaf", count: 30 }, full(42));
    spawn(b, 10, 10, { type: "leaf", count: 30 }, full(42));
    spawn(c, 10, 10, { type: "leaf", count: 30 }, full(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(FX.leafColours).toContain(a[0]?.col);
  });
});

describe("[PD-03] FX engine: step", () => {
  const one = (over: Partial<Particle> = {}): Particle => ({
    type: "spark",
    x: 0,
    y: 0,
    vx: 100,
    vy: -200,
    g: 520,
    drag: 0.975,
    life: 0.5,
    max: 0.5,
    size: 10,
    rot: 0,
    vr: 2,
    flip: 0,
    vf: 6,
    col: "#F2C14E",
    sway: 0,
    ...over,
  });

  it("[PD-03] one step: frame-rate independent drag, then gravity, then position (the reference's order)", () => {
    const p = one();
    const dt = 1 / 60;
    step([p], dt);
    const k = Math.pow(0.975, dt * 60);
    expect(p.vx).toBeCloseTo(100 * k, 10);
    expect(p.vy).toBeCloseTo(-200 * k + 520 * dt, 10);
    expect(p.x).toBeCloseTo(100 * k * dt, 10);
    expect(p.y).toBeCloseTo((-200 * k + 520 * dt) * dt, 10);
    expect(p.life).toBeCloseTo(0.5 - dt, 10);
    expect(p.rot).toBeCloseTo(2 * dt, 10);
  });

  it("[PD-03] drag gives the same speed at 30, 60 or 120 fps", () => {
    const a = one({ g: 0, life: 2, max: 2 });
    const b = one({ g: 0, life: 2, max: 2 });
    for (let i = 0; i < 30; i++) step([a], 1 / 30);
    for (let i = 0; i < 120; i++) step([b], 1 / 120);
    expect(a.vx).toBeCloseTo(b.vx, 8);
  });

  it("[PD-03] leaves sway sideways; particles die at the end of their life and fade over the last 35%", () => {
    const leaf = one({ type: "leaf", vx: 0, vy: 0, g: 0, life: 3, max: 3, sway: 0 });
    step([leaf], 0.1);
    expect(leaf.x).not.toBe(0);
    const p = one({ life: 0.5, max: 1 });
    expect(alphaOf(p)).toBe(1);
    p.life = 0.175;
    expect(alphaOf(p)).toBeCloseTo(0.5, 10);
    const parts = [one({ life: 0.01 }), one({ life: 1 })];
    step(parts, 0.02);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.life).toBeCloseTo(0.98, 10);
  });

  it("[PD-03] a 0.9 s spark burst is gone after its longest life (the loop then sleeps)", () => {
    const parts: Particle[] = [];
    spawn(parts, 0, 0, { count: 28 }, full(5));
    let t = 0;
    while (parts.length && t < 5) {
      step(parts, FX.maxDt);
      t += FX.maxDt;
    }
    expect(parts).toHaveLength(0);
    expect(t).toBeLessThanOrEqual(0.9 + FX.maxDt);
  });
});

describe("[PD-03] FX engine: burst without a canvas", () => {
  it("[PD-03] burst before the canvas is mounted (or on the server) is a no-op", () => {
    expect(burst(10, 10, { count: 20 })).toBe(0);
    expect(fxStats()).toMatchObject({ mounted: false, live: 0, running: false });
  });
});
