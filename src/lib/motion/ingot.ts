import { INGOT_BOX } from "@/lib/loyalty/ingot";
import { EASE_OUT } from "./anim";

/**
 * The ingot pour (P1-08; reference timing since PD-10, DESIGN §8.3 v2) as data, so its timing is tested without
 * a browser. Values are the reference vault script's (`design/reference/molten/index.html`, "vault"):
 * - `pour`: the first view of a shop's ingot in a browser session: 200 ms after it shows, 0 → level in 900 ms
 *   (ease-in-out quad) with the pour stream, then the glint along the surface (700 ms).
 * - `rise`: every later view in the session: the same without the stream, in 500 ms (P1-08 rule, kept).
 * - `add`: gold arriving while the vault is on screen: 1000 ms with the stream and a "+N" stamp (1400 ms).
 * - `fill`: an add that reaches the top: 1500 ms.
 * - `drain`: less gold (the reference's reset): 600 ms ease-out, nothing else.
 * Every part's last keyframe is what the Ingot SVG draws at rest, and nothing fills forwards, so finishing early
 * (scrolled away, tab hidden, reduced motion switched on, a tap) lands exactly on the static picture.
 */
export type PourKind = "pour" | "rise" | "add" | "fill" | "drain";
export type IngotPart = "fill" | "stream" | "glint" | "stamp";

export const POUR = {
  /** First on screen: how much of the ingot must show, and the wait before it pours (reference IO + timer). */
  view: { threshold: 0.45, delayMs: 200 },
  ms: { pour: 900, rise: 500, add: 1_000, fill: 1_500, drain: 600 } satisfies Record<
    PourKind,
    number
  >,
  streamFadeMs: 220,
  glint: { ms: 700, dx: 460, skewDeg: -20 },
  stamp: { ms: 1_400 },
  /** Splash sparks at the stream's foot while the pour is under 90% done. */
  splash: {
    everyMs: 140,
    until: 0.9,
    count: 4,
    speed: [60, 180] as const,
    spread: 2.4,
    life: [0.3, 0.5] as const,
  },
  /** The stream's foot sits this far above the surface (reference `surf(val) − 2`). */
  streamFootPx: 2,
  /** The reference's "Add a visit" amount (demo vault only). */
  demoVisitGold: 80,
} as const;

/** The reference's per-frame easing: `k < .5 ? 2k² : 1 − (−2k + 2)² / 2`. */
export function easeInOutQuad(k: number): number {
  const t = Math.min(1, Math.max(0, k));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** The same curve as a CSS `linear()` easing (40 even steps: within 0.0004 of the parabola everywhere). */
export const POUR_EASING = `linear(${Array.from({ length: 41 }, (_, i) =>
  String(Number(easeInOutQuad(i / 40).toFixed(5))),
).join(",")})`;

/** The gold shown at progress `k` (0–1) of a pour from `from` to `to` (the count beside the ingot). */
export const levelAt = (from: number, to: number, k: number): number =>
  from + (to - from) * easeInOutQuad(k);

export type PourStep = { kind: PourKind; from: number; to: number; fresh?: true };
type Progress = { gold: number; ingots: number };

/**
 * What a change of the member's progress plays. More gold in the same ingot pours it (`fill` when it reaches the
 * top). A completed ingot (multi-ingot overflow) fills to 100% (the unlock follows), then the new ingot starts
 * empty (`fresh`) and takes the rest; several ingots at once still play one fill. Less gold drains.
 */
export function pourSteps(prev: Progress, next: Progress, size: number): PourStep[] {
  if (!(size > 0) || !Number.isFinite(next.gold) || !Number.isFinite(prev.gold)) return [];
  const clamp = (g: number): number => Math.max(0, Math.min(size, Math.floor(g)));
  const from = clamp(prev.gold);
  const to = clamp(next.gold);
  const step = (a: number, b: number): PourStep | null =>
    b > a ? { kind: b >= size ? "fill" : "add", from: a, to: b } : null;
  if (next.ingots > prev.ingots) {
    const top: PourStep = { kind: "fill", from, to: size };
    const rest = step(0, to);
    return [top, rest ? { ...rest, fresh: true } : { kind: "drain", from: 0, to: 0, fresh: true }];
  }
  if (to < from) return [{ kind: "drain", from, to }];
  const up = step(from, to);
  return up ? [up] : [];
}

export type PartAnimation = {
  part: IngotPart;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions & { duration: number; delay: number };
};

const at = (y: number): string => `translateY(${String(y)}px)`;

/**
 * Every part's animation for one pour step, the liquid going from surface `fromY` to `toY` (user units,
 * `levelY`), starting after `delay` ms. The stream (pour, add, fill) shows for the whole pour and fades in
 * 220 ms (ease-out) at its end; the glint follows every pour but a drain; the stamp marks gold added.
 */
export function pourTimeline(
  step: { kind: PourKind; fromY: number; toY: number },
  delay = 0,
): PartAnimation[] {
  const ms = POUR.ms[step.kind];
  const drain = step.kind === "drain";
  const parts: PartAnimation[] = [
    {
      part: "fill",
      keyframes: [{ transform: at(step.fromY) }, { transform: at(step.toY) }],
      options: {
        duration: ms,
        delay,
        easing: drain ? EASE_OUT : POUR_EASING,
        fill: "backwards",
      },
    },
  ];
  if (drain) return parts;
  if (step.kind !== "rise") {
    const total = ms + POUR.streamFadeMs;
    parts.push({
      part: "stream",
      keyframes: [
        { opacity: 1 },
        { opacity: 1, offset: ms / total, easing: EASE_OUT },
        { opacity: 0 },
      ],
      options: { duration: total, delay, easing: "linear", fill: "none" },
    });
  }
  const skew = `skewX(${String(POUR.glint.skewDeg)}deg)`;
  parts.push({
    part: "glint",
    keyframes: [
      { transform: `${skew} translateX(0)`, opacity: 1 },
      { transform: `${skew} translateX(${String(POUR.glint.dx)}px)`, opacity: 1 },
    ],
    options: { duration: POUR.glint.ms, delay: delay + ms, easing: EASE_OUT, fill: "none" },
  });
  if (step.kind === "add" || step.kind === "fill") {
    parts.push({
      part: "stamp",
      keyframes: [
        { opacity: 0, transform: "scale(1.6) rotate(-8deg)" },
        { opacity: 1, transform: "scale(1) rotate(-4deg)", offset: 0.3 },
        { opacity: 1, transform: "scale(1) rotate(-4deg)", offset: 0.8 },
        { opacity: 0, transform: "translateY(-14px) rotate(-4deg)" },
      ],
      options: { duration: POUR.stamp.ms, delay, easing: EASE_OUT, fill: "none" },
    });
  }
  return parts;
}

/** When a timeline's last part ends (ms). */
export const timelineEnd = (parts: readonly PartAnimation[]): number =>
  Math.max(0, ...parts.map((p) => p.options.delay + p.options.duration));

/** The stream's foot in user units for a surface at `y`. */
export const streamFoot = (y: number): number => Math.min(INGOT_BOX.bottom, y) - POUR.streamFootPx;

/** Session key for "this shop's ingot has poured once already" (sessionStorage; storage may be blocked). */
export const pourSeenKey = (seenKey: string): string => `moz.ingot-poured.${seenKey}`;
