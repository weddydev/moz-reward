/**
 * Device effect tier (DESIGN v2 §7.2): `lite` when the device has ≤ 4 cores, ≤ 4 GB memory or Save-Data is on
 * (half the particles, no goo filter, no glass blur, no light glides); everyone else gets `full`. The same test
 * as the Molten reference (unknown values count as 8, as its `|| 8` does), marked as `<html class="lite">` like
 * the reference: `TIER_PREPAINT_SCRIPT` sets it before first paint, `applyTier()` keeps it right afterwards.
 * `/dev/motion` can override the tier for this tab (sessionStorage), so lite can be checked on any machine.
 */
export type Tier = "full" | "lite";

export const LITE_CLASS = "lite";
export const TIER_OVERRIDE_KEY = "moz:tier";

type Nav = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export function deviceTier(
  nav: Nav | undefined = typeof navigator === "undefined" ? undefined : navigator,
): Tier {
  if (!nav) return "full";
  // `||`, not `??`: like the reference, a reported 0 means "unknown", not "no cores".
  const cores = nav.hardwareConcurrency || 8;
  const memory = nav.deviceMemory || 8;
  return cores <= 4 || memory <= 4 || nav.connection?.saveData === true ? "lite" : "full";
}

function readOverride(): Tier | null {
  try {
    const v = window.sessionStorage.getItem(TIER_OVERRIDE_KEY);
    return v === "full" || v === "lite" ? v : null;
  } catch {
    return null;
  }
}

/** The tier this tab runs at: the playground's override, else the device's. */
export const resolvedTier = (): Tier => readOverride() ?? deviceTier();

/** Puts the tier on `<html>` and returns it. */
export function applyTier(tier: Tier = resolvedTier()): Tier {
  document.documentElement.classList.toggle(LITE_CLASS, tier === "lite");
  return tier;
}

/** The tier on `<html>` now (what the CSS and the FX engine use). */
export const currentTier = (): Tier =>
  typeof document !== "undefined" && document.documentElement.classList.contains(LITE_CLASS)
    ? "lite"
    : "full";

/** `/dev/motion`: force a tier for this tab, or `null` to follow the device again. */
export function setTierOverride(tier: Tier | null): Tier {
  try {
    if (tier === null) window.sessionStorage.removeItem(TIER_OVERRIDE_KEY);
    else window.sessionStorage.setItem(TIER_OVERRIDE_KEY, tier);
  } catch {
    /* storage blocked: the override still applies to this page */
  }
  return applyTier(tier ?? deviceTier());
}

/**
 * Inline <head> fragment (joined into HEAD_SCRIPT): the same rule as `deviceTier` + the override, before
 * first paint, so a lite device never shows a frame of full effects. Kept in step with `deviceTier` by test.
 */
export const TIER_PREPAINT_SCRIPT = `(function(){try{var n=navigator,t=null;try{t=sessionStorage.getItem(${JSON.stringify(TIER_OVERRIDE_KEY)})}catch(e){}var l=t==="lite"||(t!=="full"&&((n.hardwareConcurrency||8)<=4||(n.deviceMemory||8)<=4||!!(n.connection&&n.connection.saveData)));if(l)document.documentElement.classList.add(${JSON.stringify(LITE_CLASS)})}catch(e){}})()`;
