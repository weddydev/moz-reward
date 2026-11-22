/**
 * Molten controls (PD-04; DESIGN §7.4 rows Molten button, Heart toggle, Toast): the reference's values as
 * constants, shared by the components and the spec table (`molten-spec.ts`). No React here.
 */
export const BUTTON = {
  /** Label rolls back to the idle text after (reference `rollLabel` ms = 1700). */
  labelBackMs: 1700,
} as const;

export const HEART = {
  popMs: 620,
  /** Overshoot keyframe offset of the pop (scale 1.3 at .45, .92 at .75). */
  popOvershoot: 0.45,
  ringMs: 600,
  dots: 10,
  dotsMs: 650,
  dotsDelayMs: 60,
  /** Untoggle: a quick settle (scale .85 → 1). */
  offMs: 250,
} as const;

export const TOAST = {
  inMs: 520,
  coinMs: 800,
  /** Visible time and the progress bar (reference: 3600 ms linear). */
  showMs: 3600,
  outMs: 260,
} as const;

/** Fallback spring where CSS `linear()` easing is unsupported (DESIGN §7.1). */
export const SPRING_FALLBACK = "cubic-bezier(.34,1.56,.64,1)";

/** The reference's `SPRING` for Web Animations: the `--spring` token's `linear(…)`, or the fallback. */
export function springEasing(): string {
  if (typeof document === "undefined" || typeof CSS === "undefined") return SPRING_FALLBACK;
  if (!CSS.supports("transition-timing-function", "linear(0, 1)")) return SPRING_FALLBACK;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--spring").trim();
  return v === "" ? SPRING_FALLBACK : v;
}
