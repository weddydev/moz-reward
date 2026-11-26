"use client";

import { useEffect } from "react";
import { type BurstRecord, clearFxBursts, fxBursts } from "@/lib/motion/fx";

/** The window hook the parity harness and gallery E2E read the FX bursts through (dev pages only, C-92). */
export type FxBurstHook = { list: () => readonly BurstRecord[]; clear: () => void };
declare global {
  interface Window {
    __mozFxBursts?: FxBurstHook;
  }
}

/** Mounted on /dev/molten and /dev/ui: every particle burst on the page can be read back by a test. */
export function FxBurstLog(): null {
  useEffect(() => {
    window.__mozFxBursts = { list: fxBursts, clear: clearFxBursts };
    return () => {
      delete window.__mozFxBursts;
    };
  }, []);
  return null;
}
