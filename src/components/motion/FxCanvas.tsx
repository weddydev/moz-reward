"use client";

import { useEffect, useRef } from "react";
import { mountFx } from "@/lib/motion/fx";

/**
 * The one shared particle canvas (DESIGN §7; PD-03), mounted once in the root layout outside the route
 * transition, so a burst keeps falling over the next page. Fixed, full viewport, pointer-events: none
 * (`.m-fx`, molten.css), aria-hidden. The engine sizes it on the first burst; until then it is 0 × 0.
 */
export function FxCanvas(): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    return canvas ? mountFx(canvas) : undefined;
  }, []);
  return <canvas ref={ref} className="m-fx" aria-hidden="true" width={0} height={0} data-fx="" />;
}
