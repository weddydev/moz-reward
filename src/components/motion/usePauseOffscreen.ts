"use client";

import { type RefObject, useEffect } from "react";

/**
 * Endless loops sleep while their element is off screen (or under `display: none`) and while the tab is hidden,
 * like the reference's phone: sets `data-paused` on the element (molten.css pauses its own animations and every one
 * inside it). An attribute, not a class: React rewrites `className` on a re-render and would drop it (PD-11).
 * Shared by the dock (halo, radar), the wallet stack (card shine) and the molten/orbit buttons.
 */
export function usePauseOffscreen(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = true;
    const sync = (): void => {
      el.toggleAttribute("data-paused", !seen || document.hidden);
    };
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            for (const e of entries) seen = e.isIntersecting;
            sync();
          });
    io?.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ref]);
}
