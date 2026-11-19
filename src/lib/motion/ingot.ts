import { INGOT_BOX } from "@/lib/loyalty/ingot";

/**
 * The ingot pour (P1-08, DESIGN §8.3) as data, so its timing is tested without a browser. `pour` is the first
 * view of a shop's ingot in a browser session (0.9 s, with the pour stream); `rise` is every later view in
 * the session (0.5 s, the liquid rising, no stream). Both end on the static picture: every part's last
 * keyframe equals what the Ingot SVG draws at rest, so finishing early (scrolled away, tab hidden, reduced
 * motion switched on, a tap) lands exactly on the final state and nothing has to catch up later.
 */
export type PourKind = "pour" | "rise";
export type IngotPart = "fill" | "wave" | "stream" | "glint";

export const POUR_MS: Readonly<Record<PourKind, number>> = { pour: 900, rise: 500 };

/** DESIGN §7 ease-out (entrances); the wave drifts linearly. */
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export type PartAnimation = {
  part: IngotPart;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions & { duration: number; delay: number };
};

const at = (y: number): string => `translate(0px, ${String(y)}px)`;

/**
 * Every part's animation for a pour of `kind` up to the surface `level` (user units, `levelY`). The fill and
 * the wave share one rise; the wave also drifts two periods and settles from a taller swell; a glint crosses
 * the top edge at the end; `pour` adds the falling stream.
 */
export function pourTimeline(kind: PourKind, level: number): PartAnimation[] {
  const total = POUR_MS[kind];
  const pour = kind === "pour";
  const riseDelay = pour ? 80 : 0;
  const riseMs = pour ? 680 : 420;
  const glintMs = pour ? 240 : 160;
  const parts: PartAnimation[] = [
    {
      part: "fill",
      keyframes: [{ transform: at(INGOT_BOX.bottom) }, { transform: at(level) }],
      options: { duration: riseMs, delay: riseDelay, easing: EASE_OUT, fill: "backwards" },
    },
    {
      part: "wave",
      keyframes: [
        { transform: "translateX(-120px) scaleY(2.4)" },
        { transform: "translateX(0px) scaleY(1)" },
      ],
      options: { duration: total, delay: 0, easing: EASE_OUT, fill: "backwards" },
    },
    {
      part: "glint",
      keyframes: [
        { transform: "translateX(0px)", opacity: 0 },
        { transform: "translateX(120px)", opacity: 1, offset: 0.5 },
        { transform: "translateX(240px)", opacity: 0 },
      ],
      options: { duration: glintMs, delay: total - glintMs, easing: "linear", fill: "backwards" },
    },
  ];
  if (pour) {
    parts.push({
      part: "stream",
      // Eased per segment (an easing on the whole animation bends the offsets): it reaches the mould in
      // ~110 ms, keeps pouring while the liquid rises, and its tail falls away as the rise ends (760 ms).
      keyframes: [
        { transform: "scaleY(0)", opacity: 1, easing: EASE_OUT },
        { transform: "scaleY(1)", opacity: 1, offset: 0.15 },
        { transform: "scaleY(1)", opacity: 1, offset: 0.7, easing: EASE_OUT },
        { transform: "translateY(24px) scaleY(1)", opacity: 0 },
      ],
      options: { duration: 760, delay: 0, easing: "linear", fill: "backwards" },
    });
  }
  return parts;
}

/** When a timeline's last part ends (ms). */
export const timelineEnd = (parts: readonly PartAnimation[]): number =>
  Math.max(0, ...parts.map((p) => p.options.delay + p.options.duration));

/** Session key for "this shop's ingot has poured once already" (sessionStorage; storage may be blocked). */
export const pourSeenKey = (seenKey: string): string => `moz.ingot-poured.${seenKey}`;
