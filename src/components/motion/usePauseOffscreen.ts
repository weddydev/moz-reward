"use client";

import { type RefObject, useEffect } from "react";

/**
 * Endless loops sleep while their element is off screen (or under `display: none`) and while the tab is hidden,
 * like the reference's phone: toggles `m-paused` on the element (molten.css pauses every animation inside it).
 * Shared by the dock (halo, radar) and the wallet stack (card shine).
 */
export function usePauseOffscreen(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = true;
    const sync = (): void => {
      el.classList.toggle("m-paused", !seen || document.hidden);
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
