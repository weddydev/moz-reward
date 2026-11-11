/**
 * Route transitions (P0-10, DESIGN §7 "Page transitions"; DECISIONS "Pages slide as live content"): the
 * navigation directions, the tab-order rule, the arriving page's enter keyframes, shared-element names and
 * the View Transitions support check. No React, no browser APIs at import, so the root layout can use it.
 */

/** Directions a navigation can carry (`TransitionLink`, or `setNavIntent` before `router.push`). */
export const NAV = {
  forward: "nav-forward",
  back: "nav-back",
  tabForward: "nav-tab-forward",
  tabBack: "nav-tab-back",
} as const;
export type NavType = (typeof NAV)[keyof typeof NAV];

const isIndex = (n: number): boolean => Number.isInteger(n) && n >= 0;

/** Direction of a move between two positions in a navigation order (tabs, steps). */
export function navDirection(from: number, to: number): "forward" | "back" | "none" {
  if (!isIndex(from) || !isIndex(to) || from === to) return "none";
  return to > from ? "forward" : "back";
}

/** Direction for a tab switch: a later tab slides in from the right, an earlier one from the left. */
export function tabTransitionTypes(from: number, to: number): NavType[] {
  const direction = navDirection(from, to);
  if (direction === "none") return [];
  return [direction === "forward" ? NAV.tabForward : NAV.tabBack];
}

const KIND = /^[a-z][a-z0-9]*$/;

/**
 * `view-transition-name` for one entity, shared by the element on both pages of a card → page morph. A
 * <custom-ident> (`vt-` + kind + `-` + id): ids keep ASCII letters and digits and every other character is
 * written as `_<hex code point>_`, so distinct ids (and kinds, which can't contain `-`) never collide.
 */
export function vtName(kind: string, id: string | number): string {
  if (!KIND.test(kind)) throw new Error(`vtName: kind must be a lower-case word, got "${kind}"`);
  const raw = String(id);
  if (raw === "") throw new Error("vtName: empty id");
  let encoded = "";
  for (const ch of raw) {
    encoded += /^[A-Za-z0-9]$/.test(ch) ? ch : `_${(ch.codePointAt(0) ?? 0).toString(16)}_`;
  }
  return `vt-${kind}-${encoded}`;
}

/**
 * Typed View Transitions (React passes `types` and uses `view-transition-class`): Chromium 125+, Safari
 * 18.2+. Only the card → page morphs need them; the page enter (`enterKeyframes`) runs everywhere. Mirrors
 * `VT_DOWNGRADE_SCRIPT` (unit-tested together).
 */
export function hasTypedViewTransitions(win: Window): boolean {
  const ctor = (win as unknown as { ViewTransition?: { prototype?: object } }).ViewTransition;
  return (
    typeof win.document.startViewTransition === "function" &&
    !!ctor?.prototype &&
    "types" in ctor.prototype
  );
}

/**
 * Inline, before React loads: where View Transitions exist without types (Safari 18.0–18.1), hide
 * `startViewTransition` so React's object-form call can't half-run; React then swaps instantly (it catches
 * the missing API): no morph, and the page still gets its enter animation.
 */
export const VT_DOWNGRADE_SCRIPT = `(function(){try{var d=document,V=window.ViewTransition;if(typeof d.startViewTransition==="function"&&!(V&&V.prototype&&"types" in V.prototype))d.startViewTransition=undefined}catch(e){}})()`;

const OFFSET_PX: Readonly<Record<NavType, number>> = {
  [NAV.forward]: 8,
  [NAV.back]: -8,
  [NAV.tabForward]: 6,
  [NAV.tabBack]: -6,
};

/**
 * The arriving page's enter (`RouteContent`, every browser): it fades in and slides in from the side the
 * navigation came from (forward from the right, 8px; tabs 6px in tab order). The live content moves, never a
 * snapshot, so it is tappable from the first frame; nothing animates on exit, so navigation never waits.
 * No direction (browser back/forward, plain links) or reduced motion: a fade only, never the wrong way.
 */
export function enterKeyframes(type: NavType | null, motionOn: boolean): Keyframe[] {
  if (!type || !motionOn) return [{ opacity: 0 }, { opacity: 1 }];
  return [
    { opacity: 0, transform: `translateX(${String(OFFSET_PX[type])}px)` },
    { opacity: 1, transform: "none" },
  ];
}

/**
 * A CSS `<time>` token as read from `getComputedStyle(…).getPropertyValue("--dur-…")`, in milliseconds. The
 * production CSS minifier rewrites `380ms` as `.38s`, so both units are parsed; anything else (empty, `var()`,
 * a bare number, negative) is 0, which callers treat as "don't animate".
 */
export function cssTimeMs(value: string): number {
  const match = /^(\d*\.?\d+)(ms|s)$/.exec(value.trim());
  if (!match) return 0;
  const n = Number(match[1]);
  return match[2] === "s" ? Math.round(n * 1000) : n;
}

/**
 * Is a view transition running? Ours only run for card → page morphs (the page itself is never captured,
 * and a navigation without a shared pair starts none). The arriving content then only fades: the morph
 * carries the movement, and WebKit crashes the page when a transform animation starts on content while a
 * morph runs (measured 11 Nov 2026). Unknown pseudo-class (no View Transitions): false.
 */
export function viewTransitionActive(doc: Document): boolean {
  try {
    return doc.documentElement.matches(":active-view-transition");
  } catch {
    return false;
  }
}
