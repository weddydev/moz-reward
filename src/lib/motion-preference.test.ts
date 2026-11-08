// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMotionPreference,
  isReducedMotion,
  readMotionPreference,
  resolveReducedMotion,
  setMotionPreference,
} from "./motion-preference";

function mockSystem(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduce,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("motion preference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.motion;
    vi.unstubAllGlobals();
  });

  it.each([
    ["system", false, false],
    ["system", true, true],
    ["reduce", false, true],
    ["full", true, false],
  ] as const)("pref=%s system=%s → reduced=%s", (pref, system, expected) => {
    expect(resolveReducedMotion(pref, system)).toBe(expected);
  });

  it("persists the choice and mirrors it to <html data-motion>", () => {
    mockSystem(false);
    setMotionPreference("reduce");
    expect(readMotionPreference()).toBe("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
    expect(isReducedMotion()).toBe(true);

    setMotionPreference("system");
    expect(readMotionPreference()).toBe("system");
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(isReducedMotion()).toBe(false);
  });

  it("follows the system setting by default", () => {
    mockSystem(true);
    applyMotionPreference();
    expect(isReducedMotion()).toBe(true);
  });
});
