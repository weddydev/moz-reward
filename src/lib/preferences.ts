import { useSyncExternalStore } from "react";
import { MOTION_ATTRIBUTE, STORAGE_KEYS } from "./preferences-prepaint";

/**
 * Per-device display preferences (DESIGN §9, §13): reduced motion and sounds.
 *
 * - Motion = the system `prefers-reduced-motion`, overridden by the user's choice. The choice is mirrored to
 *   `<html data-reduce-motion="true|false">` (absent = follow the system), which is what the CSS reads. The
 *   inline `PREPAINT_SCRIPT` sets the attribute before first paint; this module keeps it right afterwards.
 * - Sounds default to on; "off" is stored.
 * - Signed-in customers also keep both in their profile. `connectAccount` reconciles device and profile (see
 *   `reconcile`), and every later change is saved through the `saver` given there.
 *
 * Storage can be blocked (private mode): every read falls back to the default and nothing throws.
 */
export type MotionPreference = "system" | "reduce" | "full";

/** The profile's copy: null = no choice (motion follows the system, sounds are on). */
export type AccountPreferences = { reduceMotion: boolean | null; soundOn: boolean | null };

/** What the server knows about the caller: a customer profile, none (signed out / staff only), or unknown. */
export type AccountState = AccountPreferences | "none" | "unknown";

/** Saves the device's choices to the profile. Resolves `saved: false` when the caller has no profile. */
export type PreferenceSaver = (
  values: AccountPreferences,
) => Promise<{ ok: true; saved: boolean } | { ok: false }>;

/**
 * Where this device stands against the profile: `synced` = its values are the profile's; `pending` = a change
 * made here has not reached the profile yet (sent again on the next page load); absent = device-only choices.
 */
export type SyncState = "synced" | "pending" | null;

export { MOTION_ATTRIBUTE, PREPAINT_SCRIPT, STORAGE_KEYS } from "./preferences-prepaint";

const QUERY = "(prefers-reduced-motion: reduce)";

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
}

/* ---- device state ---- */

// Storage blocked → the choice lives in memory for this page only.
let memoryMotion: MotionPreference | null = null;
let memorySound: boolean | null = null;

export function readMotionPreference(): MotionPreference {
  if (typeof window === "undefined") return "system";
  if (memoryMotion) return memoryMotion;
  const v = readKey(STORAGE_KEYS.motion);
  return v === "reduce" || v === "full" ? v : "system";
}

/** The device's stored sound choice, or null when none was made (sounds are then on). */
function readSoundChoice(): boolean | null {
  if (typeof window === "undefined") return null;
  if (memorySound !== null) return memorySound;
  const v = readKey(STORAGE_KEYS.sound);
  return v === "on" ? true : v === "off" ? false : null;
}

export const readSoundPreference = (): boolean => readSoundChoice() ?? true;

function readSync(): SyncState {
  const v = readKey(STORAGE_KEYS.sync);
  return v === "synced" || v === "pending" ? v : null;
}

export function applyMotionPreference(pref: MotionPreference = readMotionPreference()): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute(MOTION_ATTRIBUTE);
  else root.setAttribute(MOTION_ATTRIBUTE, pref === "reduce" ? "true" : "false");
}

/** Pure decision, exported for tests. */
export const resolveReducedMotion = (pref: MotionPreference, systemReduce: boolean): boolean =>
  pref === "reduce" || (pref === "system" && systemReduce);

export function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return resolveReducedMotion(readMotionPreference(), window.matchMedia(QUERY).matches);
}

const motionToAccount = (pref: MotionPreference): boolean | null =>
  pref === "system" ? null : pref === "reduce";
const motionFromAccount = (value: boolean | null): MotionPreference =>
  value === null ? "system" : value ? "reduce" : "full";

function storeMotion(pref: MotionPreference): void {
  memoryMotion = pref;
  writeKey(STORAGE_KEYS.motion, pref === "system" ? null : pref);
  // Readable storage is the source of truth (other tabs write it); memory only covers blocked storage.
  if (readKey(STORAGE_KEYS.motion) === (pref === "system" ? null : pref)) memoryMotion = null;
  applyMotionPreference(pref);
}

function storeSound(on: boolean | null): void {
  memorySound = on;
  const stored = on === null ? null : on ? "on" : "off";
  writeKey(STORAGE_KEYS.sound, stored);
  if (readKey(STORAGE_KEYS.sound) === stored) memorySound = null;
}

/* ---- profile sync ---- */

export type DevicePreferences = AccountPreferences & { sync: SyncState };

export type SyncPlan = {
  /** Values this device takes from the profile (null = nothing to change). */
  adopt: AccountPreferences | null;
  /** Send the device's (post-adopt) values to the profile. */
  push: boolean;
};

/**
 * Device vs profile, decided once per page load and after sign-in (P0-08 AC 8):
 * - `pending`: a change made on this device never reached the profile → the device wins and is sent again.
 * - `synced`: this device already follows the profile → take the profile's values, "no choice" included.
 * - neither (choices made signed out): per setting, the profile's choice wins when it has one; otherwise the
 *   device's choice is kept and saved to the profile.
 */
export function reconcile(device: DevicePreferences, account: AccountPreferences): SyncPlan {
  if (device.sync === "pending") return { adopt: null, push: true };
  if (device.sync === "synced") {
    const same = device.reduceMotion === account.reduceMotion && device.soundOn === account.soundOn;
    return { adopt: same ? null : account, push: false };
  }
  const merged: AccountPreferences = {
    reduceMotion: account.reduceMotion ?? device.reduceMotion,
    soundOn: account.soundOn ?? device.soundOn,
  };
  const adopt =
    merged.reduceMotion === device.reduceMotion && merged.soundOn === device.soundOn
      ? null
      : merged;
  const push = merged.reduceMotion !== account.reduceMotion || merged.soundOn !== account.soundOn;
  return { adopt, push };
}

let saver: PreferenceSaver | null = null;
const listeners = new Set<() => void>();
const notify = (): void => {
  listeners.forEach((l) => {
    l();
  });
};

const deviceValues = (): AccountPreferences => ({
  reduceMotion: motionToAccount(readMotionPreference()),
  soundOn: readSoundChoice(),
});

async function push(): Promise<void> {
  const save = saver;
  if (!save) return;
  writeKey(STORAGE_KEYS.sync, "pending");
  const sent = deviceValues();
  let result: Awaited<ReturnType<PreferenceSaver>>;
  try {
    result = await save(sent);
  } catch {
    return; // offline: stays pending, sent again on the next page load
  }
  if (!result.ok) return;
  if (!result.saved) {
    // No customer profile (staff or admin account): device-only from here on.
    saver = null;
    writeKey(STORAGE_KEYS.sync, null);
    return;
  }
  const now = deviceValues();
  // A newer change made while this one was in flight has its own save; only that one may mark "synced".
  if (now.reduceMotion === sent.reduceMotion && now.soundOn === sent.soundOn) {
    writeKey(STORAGE_KEYS.sync, "synced");
  }
}

/**
 * Called once the server's answer about the caller is known (page load, and again after sign-in / sign-out).
 * Returns the save in flight, if any (tests await it).
 */
export function connectAccount(account: AccountState, save: PreferenceSaver): Promise<void> {
  if (account === "unknown") return Promise.resolve(); // couldn't read the profile: change nothing
  if (account === "none") {
    saver = null;
    writeKey(STORAGE_KEYS.sync, null);
    return Promise.resolve();
  }
  saver = save;
  const plan = reconcile({ ...deviceValues(), sync: readSync() }, account);
  if (plan.adopt) {
    storeMotion(motionFromAccount(plan.adopt.reduceMotion));
    storeSound(plan.adopt.soundOn);
    notify();
  }
  if (plan.push) return push();
  writeKey(STORAGE_KEYS.sync, "synced");
  return Promise.resolve();
}

function changed(): Promise<void> {
  notify();
  if (saver) return push();
  // No profile connected right now. A device that follows a profile (marker set) may simply not have heard
  // from the server yet, or the profile could not be read: keep the change as "pending", so the next load
  // sends it instead of taking the profile's older value back. Signed out, the marker is already clear.
  if (readSync()) writeKey(STORAGE_KEYS.sync, "pending");
  return Promise.resolve();
}

export function setMotionPreference(pref: MotionPreference): Promise<void> {
  storeMotion(pref);
  return changed();
}

export function setSoundPreference(on: boolean): Promise<void> {
  storeSound(on);
  return changed();
}

/**
 * Keeps this tab in step with other tabs (the `storage` event fires only in the tabs that did not write).
 * Returns the cleanup. Mounted once by `ApplyPreferences`.
 */
export function watchOtherTabs(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== STORAGE_KEYS.motion && event.key !== STORAGE_KEYS.sound)
      return;
    memoryMotion = null;
    memorySound = null;
    applyMotionPreference();
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("storage", onStorage);
  };
}

/* ---- hooks ---- */

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  listeners.add(onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    listeners.delete(onChange);
  };
}

/**
 * `pref` is the user's choice, `reduced` the result (true → animations show their end state, ≤ 150 ms fades
 * only). Server render and the first client render assume "system" and reduced, then follow the device.
 */
export function useMotionPreference(): {
  pref: MotionPreference;
  reduced: boolean;
  setPref: (pref: MotionPreference) => void;
} {
  const pref = useSyncExternalStore(subscribe, readMotionPreference, () => "system" as const);
  const reduced = useSyncExternalStore(subscribe, isReducedMotion, () => true);
  return { pref, reduced, setPref: setMotionPref };
}

/** `on` is false on the server and the first client render (nothing plays before hydration anyway). */
export function useSoundPreference(): { on: boolean; setOn: (on: boolean) => void } {
  const on = useSyncExternalStore(subscribe, readSoundPreference, () => false);
  return { on, setOn: setSoundOn };
}

// Stable identities for the hooks; a failed save is kept as "pending", never thrown at the UI.
const setMotionPref = (pref: MotionPreference): void => {
  void setMotionPreference(pref);
};
const setSoundOn = (on: boolean): void => {
  void setSoundPreference(on);
};

/** Test helper: forget in-memory state between tests. */
export function resetPreferencesForTest(): void {
  saver = null;
  memoryMotion = null;
  memorySound = null;
  listeners.clear();
}
