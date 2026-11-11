"use client";

import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useLayoutEffect, useRef } from "react";
import { takeNavIntent } from "@/lib/motion/nav-intent";
import { cssTimeMs, enterKeyframes, viewTransitionActive } from "@/lib/motion/route-transitions";

/** Lets a nested `RouteContent` tell its parent it animated this navigation (the innermost one wins). */
const Claim = createContext<((pathname: string) => void) | null>(null);

/**
 * The page content (`data-route-content`) and its enter animation: when the path changes, the new content
 * fades in and slides in the navigation's direction (`enterKeyframes`, `--dur-slow`, `--ease-out`). Live
 * content, so it is clickable from the first frame; never on the first render, never on exit; a further
 * navigation cancels it. Nested: passive effects run child-first, so the innermost `RouteContent` whose page
 * changed animates and claims the navigation; its ancestors stay still (a tab layout's bar holds still).
 * Query-only changes don't animate. A layout effect, not a passive one: it runs in the commit (inside the
 * view transition's update when a morph runs), so nothing paints at rest first, and the "is a morph running"
 * check is reliable; React may defer passive effects past the end of the transition (measured under load). During a card → page morph the content only fades (`viewTransitionActive`).
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
    const direction = viewTransitionActive(document) ? null : type;
    const animation = el.animate(
      enterKeyframes(direction, root.getPropertyValue("--motion-on").trim() !== "0"),
      { duration, easing: root.getPropertyValue("--ease-out").trim() || "ease-out" },
    );
    return () => {
      animation.cancel();
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
