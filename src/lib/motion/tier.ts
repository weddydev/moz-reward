/**
 * Device effect tier (DESIGN v2 §7.2): `lite` when the device has ≤ 4 cores, ≤ 4 GB memory or Save-Data is on
 * (half the particles, no goo filter, no glass blur, no light glides); everyone else gets `full`. The same test
 * as the Molten reference. PD-02 uses it for the gilded edge's glide; PD-03 builds the FX engine on it.
 */
export type Tier = "full" | "lite";

type Nav = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export function deviceTier(
  nav: Nav | undefined = typeof navigator === "undefined" ? undefined : navigator,
): Tier {
  if (!nav) return "full";
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 4 || memory <= 4 || nav.connection?.saveData === true ? "lite" : "full";
}
