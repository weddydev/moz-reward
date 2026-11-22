import { describe, expect, it } from "vitest";
import { canEmulate, CI_CPU_SCORE, throttleRate } from "../tests/e2e/support/cpu-throttle";

// tests/e2e/support/cpu-throttle.ts: every machine, CI included, runs at the reference device's effective speed.
describe("[PD-03] CPU throttle rate is calibrated on every machine (DECISIONS 21 Nov)", () => {
  it("[PD-03] a runner as fast as the reference gets exactly the nominal rate", () => {
    expect(throttleRate(4, CI_CPU_SCORE)).toBe(4);
  });

  it("[PD-03] a slower CI runner is throttled less, so it emulates the same device (run 44930544649: ~46,000)", () => {
    expect(throttleRate(4, 46_000)).toBeCloseTo((4 * 46_000) / CI_CPU_SCORE, 5);
    expect(throttleRate(4, 46_000)).toBeLessThan(4);
  });

  it("[PD-03] a faster machine is throttled more, never less than the nominal device", () => {
    expect(throttleRate(4, 77_000)).toBeGreaterThan(4);
  });

  it("[PD-03] the rate stays within Chromium's useful range [1, 20]", () => {
    expect(throttleRate(4, 1_000)).toBe(1);
    expect(throttleRate(4, 10_000_000)).toBe(20);
  });
});

describe("[PD-03] a host slower than the reference device gives no verdict (DECISIONS 22 Nov)", () => {
  it("[PD-03] at least as fast unthrottled: measured; slower: not (the Windows laptop under load scored 8,780)", () => {
    expect(canEmulate(4, CI_CPU_SCORE / 4)).toBe(true);
    expect(canEmulate(4, 46_000)).toBe(true); // the slowest CI runner seen
    expect(canEmulate(4, 8_780)).toBe(false);
    expect(canEmulate(4, CI_CPU_SCORE / 4 - 1)).toBe(false);
  });
});
