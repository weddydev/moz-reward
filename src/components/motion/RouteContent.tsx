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

/** Lets a nested `RouteContent` tell its parent it animated this navigation (the innermost one wins). */
const Claim = createContext<((pathname: string) => void) | null>(null);

/**
 * The page content (`data-route-content`) and its enter animation: when the path changes, the new content
 * fades in and slides in the navigation's direction (`enterKeyframes`, `--dur-slow`, `--ease-out`). Live
 * content, so it is clickable from the first frame; never on the first render, never on exit; a further
 * navigation cancels it, and reduced motion switched on mid-slide ends it at once. Nested: passive effects run child-first, so the innermost `RouteContent` whose page
 * changed animates and claims the navigation; its ancestors stay still (a tab layout's bar holds still).
 * Query-only changes don't animate. A layout effect, not a passive one: it runs in the commit (inside the
 * view transition's update when a morph runs), so nothing paints at rest first, and the "is a morph running"
 * check is reliable; React may defer passive effects past the end of the transition (measured under load).
 * The content only fades, in place, during a card → page morph (`viewTransitionActive`) and from 1024px up
 * (`FADE_IN_PLACE_QUERY`, DESIGN §7 "Desktop").
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
    if (!el || typeof el.animate !== "function") return;
    const root = getComputedStyle(document.documentElement);
    const duration = cssTimeMs(root.getPropertyValue("--dur-slow"));
    if (duration <= 0) return;
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
    const unclip = (): void => {
      boxes.forEach((box, i) => {
        if (box.style.overflowX === "clip") box.style.overflowX = before[i] ?? "";
      });
    };
    animation.finished.then(unclip, unclip);
    // Reduced motion switched on mid-slide (the Me toggle, or the system setting): land at once.
    const landIfReduced = (): void => {
      const on = getComputedStyle(document.documentElement).getPropertyValue("--motion-on");
      if (on.trim() === "0") animation.finish();
    };
    const system = window.matchMedia("(prefers-reduced-motion: reduce)");
    const toggle = parent ? new MutationObserver(landIfReduced) : null;
    if (toggle) {
      toggle.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-reduce-motion"],
      });
      system.addEventListener("change", landIfReduced);
    }
    const unwatch = (): void => {
      toggle?.disconnect();
      system.removeEventListener("change", landIfReduced);
    };
    animation.finished.then(unwatch, unwatch);
    return () => {
      animation.cancel();
      unclip();
      unwatch();
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
