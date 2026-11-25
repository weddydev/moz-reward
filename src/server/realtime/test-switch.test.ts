import { describe, expect, it } from "vitest";
import { realtimeOffForTest } from "./test-switch";

describe("[P1-10] the E2E realtime-off cookie works only when APP_ENV=test", () => {
  it("switches realtime off in the test build", () => {
    expect(realtimeOffForTest("moz_e2e_realtime=off", "test")).toBe(true);
    expect(
      realtimeOffForTest("moz_consent=analytics-v1-denied; moz_e2e_realtime=off", "test"),
    ).toBe(true);
  });

  it("is ignored on every other environment", () => {
    for (const appEnv of ["local", "staging", "production"]) {
      expect(realtimeOffForTest("moz_e2e_realtime=off", appEnv)).toBe(false);
    }
  });

  it("needs the exact cookie and value", () => {
    expect(realtimeOffForTest(null, "test")).toBe(false);
    expect(realtimeOffForTest("moz_e2e_realtime=on", "test")).toBe(false);
    expect(realtimeOffForTest("x_moz_e2e_realtime=off", "test")).toBe(false);
    expect(realtimeOffForTest("moz_e2e_realtime=offx", "test")).toBe(false);
  });
});
