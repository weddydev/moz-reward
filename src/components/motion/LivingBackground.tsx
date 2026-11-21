"use client";

import { useEffect, useRef } from "react";

/**
 * The living background (DESIGN v2 §6.1; PD-02): three slow drifting glows (gold light, pearl rose, pearl mint;
 * 26 / 32 / 38 s alternate) and a 5% grain, fixed behind the page, aria-hidden. The glows pause while the tab
 * is hidden and hold still under reduced motion (molten.css). The effect tier is on `<html class="lite">`
 * (pre-paint script, `src/lib/motion/tier.ts`).
 */
export function LivingBackground(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = (): void => {
      el.classList.toggle("m-paused", document.hidden);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return (
    <div ref={ref} aria-hidden="true" data-living-background="">
      <div className="m-aurora">
        <i />
        <i />
        <i />
      </div>
      <div className="m-grain" />
    </div>
  );
}
