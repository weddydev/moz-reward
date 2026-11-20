"use client";

import { useEffect, useRef } from "react";
import { deviceTier } from "@/lib/motion/tier";

/**
 * The living background (DESIGN v2 §6.1; PD-02): three slow drifting glows (gold light, pearl rose, pearl mint;
 * 26 / 32 / 38 s alternate) and a 5% grain, fixed behind the page, aria-hidden. The glows pause while the tab
 * is hidden and hold still under reduced motion (molten.css). Also marks `<html data-tier>` (DESIGN §7.2) for
 * the effects that scale down on lite devices.
 */
export function LivingBackground(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset.tier = deviceTier();
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
