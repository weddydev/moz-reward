import { describe, expect, it, vi } from "vitest";
import { preloadQuietly } from "./preload";

describe("[PD-11] preloadQuietly (a warm-up chunk load that fails is not an error)", () => {
  it("[PD-11] starts the load once and swallows a failed fetch (offline, or cancelled by a navigation)", async () => {
    const load = vi.fn(() => Promise.reject(new TypeError("Load failed")));
    preloadQuietly(load);
    expect(load).toHaveBeenCalledTimes(1);
    // An unhandled rejection would fail this run (Vitest reports them as errors).
    await new Promise((r) => setTimeout(r, 0));
  });

  it("[PD-11] a load that throws synchronously is swallowed too", () => {
    expect(() => {
      preloadQuietly(() => {
        throw new Error("no chunk loader");
      });
    }).not.toThrow();
  });
});
