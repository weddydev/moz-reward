"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { fallbackEnterKeyframes, hasTypedViewTransitions } from "@/lib/motion/route-transitions";

/**
 * The element `RouteTransition`'s `<ViewTransition>` names, plus the enter animation for browsers without
 * typed View Transitions: when the path changes, the new content fades in and rises 8px (`--dur-slow`,
 * `fallbackEnterKeyframes`). Never on the first render, never on exit; a further navigation cancels it, and
 * the content is in the DOM and clickable from the first frame.
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
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const el = ref.current;
    if (!el || hasTypedViewTransitions(window) || typeof el.animate !== "function") return;
    const root = getComputedStyle(document.documentElement);
    const duration = Number.parseFloat(root.getPropertyValue("--dur-slow")) || 0;
    if (duration <= 0) return;
    const animation = el.animate(
      fallbackEnterKeyframes(root.getPropertyValue("--motion-on").trim() !== "0"),
      { duration, easing: root.getPropertyValue("--ease-out").trim() || "ease-out" },
    );
    return () => {
      animation.cancel();
    };
  }, [pathname]);
  return (
    <div ref={ref} className={className} data-route-content="">
      {children}
    </div>
  );
}
