"use client";

import { useEffect } from "react";
import {
  type AccountState,
  applyMotionPreference,
  connectAccount,
  watchOtherTabs,
} from "@/lib/preferences";
import { armSound } from "@/lib/sound";
import { savePreferences } from "./actions";

const save = async (
  values: Parameters<typeof savePreferences>[0],
): Promise<{ ok: true; saved: boolean } | { ok: false }> => {
  const result = await savePreferences(values);
  return result.ok ? { ok: true, saved: result.data.saved } : { ok: false };
};

/**
 * Keeps the per-device preferences applied after hydration (the inline pre-paint script in the root layout
 * did the first paint), follows other tabs, and reconciles the device with the signed-in customer's profile
 * (`account` comes from the server on every full load and on `router.refresh()` after sign-in / sign-out).
 * Also marks `<html data-hydrated>` so tests can wait for hydration instead of guessing (the E2E axe guard:
 * controls enabled at hydration fade in, and a scan mid-fade reads blended colours).
 */
export function ApplyPreferences({ account }: { account: AccountState }): null {
  useEffect(() => {
    applyMotionPreference();
    document.documentElement.dataset.hydrated = "true";
    armSound(); // audio unlocks inside the first tap or key press, never before (DESIGN §9)
    return watchOtherTabs();
  }, []);

  const reduceMotion = typeof account === "string" ? null : account.reduceMotion;
  const soundOn = typeof account === "string" ? null : account.soundOn;
  const kind = typeof account === "string" ? account : "account";
  useEffect(() => {
    void connectAccount(kind === "account" ? { reduceMotion, soundOn } : kind, save);
  }, [kind, reduceMotion, soundOn]);

  return null;
}
