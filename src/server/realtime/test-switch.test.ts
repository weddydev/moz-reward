import { describe, expect, it } from "vitest";
import { realtimeOffForTest } from "./test-switch";

describe("[P1-10] the E2E realtime-off header works only when APP_ENV=test", () => {
  it("switches realtime off in the test build", () => {
    expect(realtimeOffForTest("off", "test")).toBe(true);
  });

  it("is ignored on every other environment", () => {
    for (const appEnv of ["local", "staging", "production"]) {
      expect(realtimeOffForTest("off", appEnv)).toBe(false);
    }
  });

  it("needs the exact value", () => {
    expect(realtimeOffForTest(null, "test")).toBe(false);
    expect(realtimeOffForTest("on", "test")).toBe(false);
    expect(realtimeOffForTest("off ", "test")).toBe(false);
    expect(realtimeOffForTest("OFF", "test")).toBe(false);
  });
});
