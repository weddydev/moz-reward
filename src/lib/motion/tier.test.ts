// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTier,
  currentTier,
  deviceTier,
  setTierOverride,
  TIER_OVERRIDE_KEY,
  TIER_PREPAINT_SCRIPT,
} from "./tier";

const runPrepaint = (): void => {
  // Our own constant, run the way the browser runs the inline <script>.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (new Function(TIER_PREPAINT_SCRIPT) as () => void)();
};

describe("[PD-02] device tier (DESIGN §7.2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
    document.documentElement.classList.remove("lite");
  });

  it("[PD-02] lite at ≤ 4 cores, ≤ 4 GB or Save-Data; full otherwise and when unknown", () => {
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe("full");
    expect(deviceTier({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe("lite");
    expect(deviceTier({ hardwareConcurrency: 8, connection: { saveData: true } })).toBe("lite");
    expect(deviceTier({})).toBe("full");
    // Like the reference's `|| 8`: a reported 0 is unknown, not "no cores".
    expect(deviceTier({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe("full");
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

  it("[PD-03] marks <html class=lite>; the tab override wins over the device and can be cleared", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 16, deviceMemory: 16 });
    expect(applyTier()).toBe("full");
    expect(currentTier()).toBe("full");
    expect(setTierOverride("lite")).toBe("lite");
    expect(document.documentElement.classList.contains("lite")).toBe(true);
    expect(sessionStorage.getItem(TIER_OVERRIDE_KEY)).toBe("lite");
    expect(applyTier()).toBe("lite"); // a later apply keeps the override
    expect(setTierOverride(null)).toBe("full");
    expect(currentTier()).toBe("full");
  });

  it("[PD-03] the pre-paint script makes the same call as deviceTier, override included", () => {
    const cases = [
      { hardwareConcurrency: 8, deviceMemory: 8 },
      { hardwareConcurrency: 4, deviceMemory: 8 },
      { hardwareConcurrency: 8, deviceMemory: 4 },
      { hardwareConcurrency: 8, deviceMemory: 8, connection: { saveData: true } },
      { hardwareConcurrency: 0 },
      {},
    ];
    for (const nav of cases) {
      vi.stubGlobal("navigator", nav);
      document.documentElement.classList.remove("lite");
      runPrepaint();
      expect(currentTier(), JSON.stringify(nav)).toBe(deviceTier(nav));
    }
    vi.stubGlobal("navigator", { hardwareConcurrency: 16 });
    sessionStorage.setItem(TIER_OVERRIDE_KEY, "lite");
    document.documentElement.classList.remove("lite");
    runPrepaint();
    expect(currentTier()).toBe("lite");
  });
});
