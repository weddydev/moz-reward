/**
 * Route transitions (P0-10, DESIGN §7 "Page transitions"): the navigation types React's `<ViewTransition>`
 * maps to CSS classes (rules in globals.css), the tab-order direction rule, shared-element names and the
 * View Transitions support check. No React, no browser APIs at import, so the root layout can use it.
 */

/** Transition types a navigation can carry (`<Link transitionTypes>` / `router.push(…, { transitionTypes })`). */
export const NAV = {
  forward: "nav-forward",
  back: "nav-back",
  tabForward: "nav-tab-forward",
  tabBack: "nav-tab-back",
} as const;
export type NavType = (typeof NAV)[keyof typeof NAV];

/**
 * Class map for `RouteTransition`'s `<ViewTransition update>`: each type animates with the class of the same
 * name; anything untyped (browser back/forward, refresh, an in-page transition) gets no directional
 * animation, only the root cross-fade.
 */
export const PAGE_TRANSITION: Readonly<Record<NavType | "default", string>> = {
  [NAV.forward]: NAV.forward,
  [NAV.back]: NAV.back,
  [NAV.tabForward]: NAV.tabForward,
  [NAV.tabBack]: NAV.tabBack,
  default: "none",
};

const isIndex = (n: number): boolean => Number.isInteger(n) && n >= 0;

/** Direction of a move between two positions in a navigation order (tabs, steps). */
export function navDirection(from: number, to: number): "forward" | "back" | "none" {
  if (!isIndex(from) || !isIndex(to) || from === to) return "none";
  return to > from ? "forward" : "back";
}

/** Transition types for a tab switch: a later tab slides in from the right, an earlier one from the left. */
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
 * 18.2+. Without them the content uses the CSS enter fallback (`RouteContent`).
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
 * the missing API) and the page gets the same CSS enter fallback as browsers with no View Transitions.
 */
export const VT_DOWNGRADE_SCRIPT = `(function(){try{var d=document,V=window.ViewTransition;if(typeof d.startViewTransition==="function"&&!(V&&V.prototype&&"types" in V.prototype))d.startViewTransition=undefined}catch(e){}})()`;

/**
 * Enter-only fallback where typed View Transitions are missing: the arriving page fades in and rises 8px
 * (`--dur-slow`); nothing animates on exit, so navigation never waits. Vertical, because the fallback can't
 * tell forward from back and a sideways slide could point the wrong way. Reduced motion: fade only.
 */
export function fallbackEnterKeyframes(motionOn: boolean): Keyframe[] {
  return motionOn
    ? [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
}
