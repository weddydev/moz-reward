"use client";

import { useEffect } from "react";
import { applyMotionPreference } from "@/lib/motion-preference";

/** Applies stored per-device preferences to <html> after hydration (CSS defaults to the system). */
export function ApplyPreferences(): null {
  useEffect(() => {
    applyMotionPreference();
  }, []);
  return null;
}
