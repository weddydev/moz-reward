import { readSoundPreference } from "./preferences";

/**
 * Haptics (DESIGN §10): Android/Chromium vibration patterns. A no-op where `navigator.vibrate` is missing
 * (iOS Safari, desktop: motion and sound carry it; no hacks) and when the sounds and haptics toggle is off.
 * The browser also ignores it without a recent user gesture. Returns whether the device was asked to vibrate.
 */
export const HAPTICS = {
  /** Press confirmation of a primary action. */
  press: 12,
  /** Points credited. */
  credit: [18, 40, 18],
  /** Reward unlocked. */
  reward: [30, 50, 30, 50, 60],
} as const satisfies Record<string, number | readonly number[]>;

export type HapticName = keyof typeof HAPTICS;

export function haptic(name: HapticName): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (!readSoundPreference()) return false;
  const pattern = HAPTICS[name];
  try {
    return navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    return false;
  }
}
