/**
 * Gilded Gate 2.0's converging particles (PD-09, DESIGN §8.1 step 2), ported verbatim from the reference intro
 * (`design/reference/molten/index.html`, "Gilded Gate 2.0": `targets()`, `build()`, `frame()`).
 *
 * Each function stands alone (no outside helpers, constants or imports): the gate's inline canvas script
 * (`gateCanvasScript` in `gilded-gate.ts`) inlines their source, the same way as the morph. Random numbers are
 * drawn in exactly the reference's order, so with the parity harness's seeded `Math.random` both pages draw the
 * same particles (tests/parity, PD-09).
 */

/** The particle colours, in the reference's order (the colour draw indexes this list). */
export const GATE_COLOURS = [
  "#FFE08A",
  "#FFC93C",
  "#F2C14E",
  "#FFF1BF",
  "#E0AE3E",
  "#FF9F2E",
] as const;

export type GateTarget = readonly [x: number, y: number];

export type GateParticle = {
  /** Target radius and angle about the coin's centre. */
  tr: number;
  ta: number;
  /** Start radius. */
  r0: number;
  /** Spiral (radians, signed: the direction). */
  spin: number;
  delay: number;
  dur: number;
  /** Square size in px. */
  s: number;
  c: string;
  /** Carries a glow sprite. */
  g: boolean;
};

/**
 * Where the particles settle: every `step` px of the coin's ring mask (the alpha of an offscreen canvas with the
 * coin's two rings stroked, `size` square), plus 400 random points in the disc (160 on lite), shuffled, then
 * the first 950 (420 on lite). Coordinates are relative to the coin's centre.
 */
export function sampleTargets(
  alpha: Uint8ClampedArray,
  size: number,
  lite: boolean,
  rng: () => number,
): GateTarget[] {
  const out: [number, number][] = [];
  const step = lite ? 3 : 2;
  for (let y = 0; y < size; y += step)
    for (let x = 0; x < size; x += step)
      if ((alpha[(y * size + x) * 4 + 3] ?? 0) > 120) out.push([x - size / 2, y - size / 2]);
  for (let i = 0, n = lite ? 160 : 400; i < n; i++) {
    const a = rng() * 6.283;
    const r = Math.sqrt(rng()) * size * 0.37;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i] as [number, number];
    out[i] = out[j] as [number, number];
    out[j] = t;
  }
  return out.slice(0, lite ? 420 : 950);
}

/** One particle per target; `big` is the stage's longer side (start radius .55–1 × it). */
export function buildParticles(
  targets: readonly GateTarget[],
  big: number,
  rng: () => number,
): GateParticle[] {
  const cols = ["#FFE08A", "#FFC93C", "#F2C14E", "#FFF1BF", "#E0AE3E", "#FF9F2E"];
  return targets.map(([tx, ty]) => {
    const r0 = big * (0.55 + rng() * 0.45);
    const spin = (rng() < 0.5 ? 1 : -1) * (2.2 + rng() * 1.6) * Math.PI;
    const delay = rng() * 300;
    const dur = 620 + rng() * 340;
    const s = 0.8 + rng() * 1.6;
    const c = cols[Math.floor(rng() * cols.length)] ?? "#FFE08A";
    const g = rng() < 0.08;
    return { tr: Math.hypot(tx, ty), ta: Math.atan2(ty, tx), r0, spin, delay, dur, s, c, g };
  });
}

/** The convergence easing (cubic in-out). */
export function gateEase(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

/**
 * A particle at `t` ms after the gate starts (convergence begins at 300 ms): its position about the centre
 * (`cx`, `cy`) and alpha, or null before it starts. Settled particles stay on their target.
 */
export function particleAt(
  p: GateParticle,
  t: number,
  cx: number,
  cy: number,
): { x: number; y: number; alpha: number } | null {
  const l = (t - 300 - p.delay) / p.dur;
  if (l < 0) return null;
  const k = Math.min(1, l);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const a = p.ta + p.spin * (1 - e);
  const r = p.r0 + (p.tr - p.r0) * e;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, alpha: 0.55 + 0.45 * e };
}
