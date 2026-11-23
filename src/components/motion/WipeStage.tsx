"use client";

import { useEffect, useRef } from "react";
import { registerWipeStage } from "@/lib/motion/wipe-stage";

/**
 * The fixed layer the card → shop gold wipe plays on (PD-08; `wipe-stage.ts`): the metal circle on the way in,
 * the closing copy of the shop on the way back. Hidden at rest; under the dock and the rail, over the page
 * content; never takes a tap. Mounted once in the customer shell, outside the page content (which moves).
 */
export function WipeStage(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    registerWipeStage(ref.current);
    return () => {
      registerWipeStage(null);
    };
  }, []);
  return (
    <div ref={ref} className="m-wipe-stage" hidden aria-hidden="true" data-testid="wipe-stage">
      <div className="m-wipe" />
    </div>
  );
}
