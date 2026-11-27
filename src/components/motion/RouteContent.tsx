"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useRef } from "react";
import { takeNavIntent } from "@/lib/motion/nav-intent";
import {
  cssTimeMs,
  enterKeyframes,
  FADE_IN_PLACE_QUERY,
  viewTransitionActive,
} from "@/lib/motion/route-transitions";
import { openWipe, returnWipe, settleWipe } from "@/lib/motion/wipe-stage";

/** Lets a nested `RouteContent` tell its parent it animated this navigation (the innermost one wins). */
const Claim = createContext<((pathname: string) => void) | null>(null);

/**
 * The page content (`data-route-content`) and its enter animation: when the path changes, the new content
 * fades in and slides in the navigation's direction (`enterKeyframes`, `--dur-expressive`, `--ease-out`). Live
 * content, so it is clickable from the first frame; never on the first render, never on exit; a further
 * navigation cancels it, and reduced motion switched on mid-slide ends it at once. Nested: passive effects run child-first, so the innermost `RouteContent` whose page
 * changed animates and claims the navigation; its ancestors stay still (a tab layout's bar holds still).
 * Query-only changes don't animate. A layout effect, not a passive one: it runs in the commit (inside the
 * view transition's update when a morph runs), so nothing paints at rest first, and the "is a morph running"
 * check is reliable; React may defer passive effects past the end of the transition (measured under load).
 * The content only fades, in place, during a card → page morph (`viewTransitionActive`) and from 1024px up
 * (`FADE_IN_PLACE_QUERY`, DESIGN §7 "Desktop"). A Wallet card → shop navigation plays the gold wipe instead
 * (`wipe-stage.ts`: the content opens in the circle from the tap), and back from it returns the Wallet.
 */
export function RouteContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const previous = useRef(pathname);
  const claimParent = use(Claim);
  const claimedByChild = useRef<string | null>(null);
  const claim = useCallback((path: string) => {
    claimedByChild.current = path;
  }, []);
  useLayoutEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const childClaimed = claimedByChild.current === pathname;
    claimedByChild.current = null;
    if (childClaimed) return;
    claimParent?.(pathname);
    const type = takeNavIntent(pathname);
    const el = ref.current;
    // Focus went with the old page (the pressed link is gone): give it to the new page's heading, so keyboard
    // and screen reader users carry on from the top of it, not from <body> (P1-B close QA L4). Focus that is
    // still somewhere (the dock, the rail) stays where it is.
    const stopFocus = el ? focusNewPage(el) : () => undefined;
    if (!el || typeof el.animate !== "function") return stopFocus;
    // A Wallet card's gold wipe (or its way back) waiting for this page plays instead of the slide (PD-08).
    const wiped = openWipe(el, pathname) ?? returnWipe(el, pathname);
    if (wiped) {
      // Reduced motion switched on mid-wipe: the wipe and the parts rising with it land at once (FOLLOWUPS L8).
      const unwatchWipe = onReducedMotion(() => {
        wiped.finish();
        for (const a of el.getAnimations({ subtree: true }))
          if (a.effect?.getTiming().iterations !== Infinity) a.finish();
      });
      wiped.finished.then(unwatchWipe, unwatchWipe);
      return () => {
        wiped.cancel();
        unwatchWipe();
        stopFocus();
      };
    }
    // Any other page: a wipe still showing (it pointed elsewhere, or the user left mid-way) goes now.
    settleWipe();
    const root = getComputedStyle(document.documentElement);
    const duration = cssTimeMs(root.getPropertyValue("--dur-expressive"));
    if (duration <= 0) return stopFocus;
    const motionOn = root.getPropertyValue("--motion-on").trim() !== "0";
    const inPlace =
      viewTransitionActive(document) || window.matchMedia(FADE_IN_PLACE_QUERY).matches;
    const direction = inPlace ? null : type;
    const animation = el.animate(enterKeyframes(direction, motionOn), {
      duration,
      easing: root.getPropertyValue("--ease-out").trim() || "ease-out",
    });
    // A slide starts a few px to one side: clip that on the parent while it runs, so the page never gets
    // wider than the screen (no sideways pan on phones, no scrollbar flash). `clip` makes no scroll box.
    // <body> hands its overflow to the viewport instead of clipping, unless <html> has one of its own.
    const parent = direction && motionOn ? el.parentElement : null;
    const boxes = parent
      ? parent === document.body
        ? [parent, document.documentElement]
        : [parent]
      : [];
    const before = boxes.map((box) => box.style.overflowX);
    for (const box of boxes) box.style.overflowX = "clip";
    // Once only: cleanup calls it at once, and the cancelled animation's rejected `finished` calls it again
    // a microtask later, by which time the next slide may have put its own clip on the same parent.
    let released = false;
    const unclip = (): void => {
      if (released) return;
      released = true;
      boxes.forEach((box, i) => {
        box.style.overflowX = before[i] ?? "";
      });
    };
    animation.finished.then(unclip, unclip);
    // Reduced motion switched on mid-enter (the Me toggle, or the system setting): land at once.
    const unwatch = motionOn
      ? onReducedMotion(() => {
          animation.finish();
        })
      : () => undefined;
    animation.finished.then(unwatch, unwatch);
    return () => {
      animation.cancel();
      unclip();
      unwatch();
      stopFocus();
    };
  }, [pathname, claimParent]);
  return (
    <Claim value={claim}>
      <div ref={ref} className={className} data-route-content="">
        {children}
      </div>
    </Claim>
  );
}

/** How long a page that streams in after its loading skeleton may take to show its heading. */
export const FOCUS_HEADING_WAIT_MS = 5_000;

/**
 * Moves focus to the page's `h1` (focusable from script only) when focus was lost with the old page. A page that
 * streams in after its loading skeleton (which has no `h1`) gets it when the heading arrives, if focus is still
 * lost then. Returns the function that stops waiting (the next navigation).
 */
export function focusNewPage(content: HTMLElement): () => void {
  const lost = (): boolean => {
    const active = document.activeElement;
    return !active || active === document.body || !active.isConnected;
  };
  const tryFocus = (): boolean => {
    const heading = content.querySelector<HTMLElement>("h1");
    if (!heading) return false;
    if (lost()) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    return true;
  };
  if (!lost() || tryFocus()) return () => undefined;
  const watch = new MutationObserver(() => {
    if (tryFocus()) stop();
  });
  const timer = window.setTimeout(stop, FOCUS_HEADING_WAIT_MS);
  function stop(): void {
    watch.disconnect();
    window.clearTimeout(timer);
  }
  watch.observe(content, { childList: true, subtree: true });
  return stop;
}

/**
 * Calls `land` once reduced motion comes on (the Me toggle's `data-reduce-motion`, or the system setting), as
 * `--motion-on` reads 0. Returns the function that stops watching.
 */
function onReducedMotion(land: () => void): () => void {
  const check = (): void => {
    const on = getComputedStyle(document.documentElement).getPropertyValue("--motion-on");
    if (on.trim() === "0") land();
  };
  const system = window.matchMedia("(prefers-reduced-motion: reduce)");
  const toggle = new MutationObserver(check);
  toggle.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-reduce-motion"],
  });
  system.addEventListener("change", check);
  return () => {
    toggle.disconnect();
    system.removeEventListener("change", check);
  };
}
