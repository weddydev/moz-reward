/**
 * The reference's `anim()` (PD-03): a Web Animations call with Molten defaults (fill both, ease-out) that
 * shrinks to a ≤ 150 ms fade-length step with no delay under reduced motion (`<html class="rm">`, the one
 * signal; DESIGN §7.2). Everything the press kit and later moments animate from script goes through it.
 */
export const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
/** Longest animation under reduced motion (DESIGN §7.2). */
export const RM_MAX_MS = 150;

export const reducedMotionNow = (): boolean =>
  typeof document !== "undefined" && document.documentElement.classList.contains("rm");

/** Pure: the options `anim()` passes to `Element.animate`. */
export function animOptions(
  o: KeyframeAnimationOptions,
  reduced: boolean,
): KeyframeAnimationOptions {
  const opts: KeyframeAnimationOptions = { fill: "both", easing: EASE_OUT, ...o };
  if (reduced) {
    const d = typeof o.duration === "number" && o.duration > 0 ? o.duration : RM_MAX_MS;
    opts.duration = Math.min(d, RM_MAX_MS);
    opts.delay = 0;
  }
  return opts;
}

export function anim(
  el: Element | null | undefined,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  o: KeyframeAnimationOptions = {},
): Animation | null {
  if (!el || typeof el.animate !== "function") return null;
  return el.animate(keyframes, animOptions(o, reducedMotionNow()));
}
