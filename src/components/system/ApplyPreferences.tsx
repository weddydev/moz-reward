"use client";

import { useEffect } from "react";
import { applyMotionPreference } from "@/lib/motion-preference";

/**
 * Applies stored per-device preferences to <html> after hydration (CSS defaults to the system), and marks
 * `<html data-hydrated>` so tests can wait for hydration instead of guessing (the E2E axe guard: controls
 * enabled at hydration fade in, and a scan mid-fade reads blended colours).
 */
export function ApplyPreferences(): null {
  useEffect(() => {
    applyMotionPreference();
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
