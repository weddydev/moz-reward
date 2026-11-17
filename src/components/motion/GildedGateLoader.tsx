"use client";

import { useEffect } from "react";
import { GATE } from "@/lib/motion/gilded-gate";

/**
 * Loads the gate's morph + sound chunk only when the pre-paint script actually plays the gate (P1-03 AC:
 * never loaded without `src`, nor on a replayed or skipped visit). Renders nothing.
 */
export function GildedGateLoader(): null {
  useEffect(() => {
    const gate = document.getElementById(GATE.id);
    if (gate?.dataset.state !== "play") return;
    import("./gilded-gate-run")
      .then((m) => {
        m.runGate(gate);
      })
      .catch(() => {
        /* chunk failed: the CSS timeline still plays and ends on its own */
      });
  }, []);
  return null;
}
