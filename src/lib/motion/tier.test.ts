import { describe, expect, it } from "vitest";
import { deviceTier } from "./tier";

describe("[PD-02] device tier (DESIGN §7.2)", () => {
  it("[PD-02] lite at ≤ 4 cores, ≤ 4 GB or Save-Data; full otherwise and when unknown", () => {
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe("full");
    expect(deviceTier({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, connection: { saveData: true } })).toBe("lite");
    expect(deviceTier({})).toBe("full");
    expect(deviceTier(undefined)).toBe("full");
  });
});
