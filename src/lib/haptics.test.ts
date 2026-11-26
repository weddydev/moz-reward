// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { haptic, HAPTICS } from "./haptics";
import { resetPreferencesForTest, setSoundPreference } from "./preferences";

const stubVibrate = (impl: (pattern: number | number[]) => boolean): ReturnType<typeof vi.fn> => {
  const fn = vi.fn(impl);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: fn });
  return fn;
};

beforeEach(() => {
  window.localStorage.clear();
  resetPreferencesForTest();
});
afterEach(() => {
  Reflect.deleteProperty(navigator, "vibrate");
});

describe("[P0-11] haptics (DESIGN §10)", () => {
  it("uses the patterns from the design", () => {
    expect(HAPTICS).toEqual({
      press: 12,
      credit: [18, 40, 18],
      reward: [30, 50, 30, 50, 60],
    });
  });

  it.each(Object.entries(HAPTICS))("%s vibrates with its pattern", (name, pattern) => {
    const vibrate = stubVibrate(() => true);
    expect(haptic(name as keyof typeof HAPTICS)).toBe(true);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(pattern);
  });

  it("[P1-15] stays still before the page has had a tap (a moment on app open: Chrome blocks it and logs an error)", () => {
    const vibrate = stubVibrate(() => true);
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: false, isActive: false },
    });
    expect(haptic("credit")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { hasBeenActive: true, isActive: false },
    });
    expect(haptic("credit")).toBe(true); // after any tap, a later moment may vibrate
    Reflect.deleteProperty(navigator, "userActivation");
  });

  it("is a no-op where there is no vibration API (iOS Safari, desktop)", () => {
    expect("vibrate" in navigator).toBe(false);
    expect(haptic("press")).toBe(false);
  });

  it("is off when the sounds and haptics toggle is off", async () => {
    const vibrate = stubVibrate(() => true);
    await setSoundPreference(false);
    expect(haptic("reward")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    await setSoundPreference(true);
    expect(haptic("reward")).toBe(true);
  });

  it("reports false when the browser refuses (no user activation) and never throws", () => {
    stubVibrate(() => false);
    expect(haptic("credit")).toBe(false);
    stubVibrate(() => {
      throw new Error("not allowed");
    });
    expect(haptic("credit")).toBe(false);
  });
});
