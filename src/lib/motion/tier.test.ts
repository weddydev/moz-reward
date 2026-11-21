import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceTier } from "./tier";

describe("[PD-02] device tier (DESIGN §7.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[PD-02] lite at ≤ 4 cores, ≤ 4 GB or Save-Data; full otherwise and when unknown", () => {
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe("full");
    expect(deviceTier({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, connection: { saveData: true } })).toBe("lite");
    expect(deviceTier({})).toBe("full");
  });

  // Node 21+ has a global `navigator` whose hardwareConcurrency is the host's core count (4 on GitHub runners),
  // so the no-argument cases stub it instead of depending on the machine running the test.
  it("[PD-02] with no argument reads the global navigator, and is full when there is none (server render)", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 2, deviceMemory: 8 });
    expect(deviceTier()).toBe("lite");
    vi.stubGlobal("navigator", { hardwareConcurrency: 16, deviceMemory: 16 });
    expect(deviceTier()).toBe("full");
    vi.stubGlobal("navigator", undefined);
    expect(deviceTier()).toBe("full");
  });
});
