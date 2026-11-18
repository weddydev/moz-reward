import { describe, expect, it } from "vitest";
import { addDays, londonDate, londonInstant, londonWall } from "./time";

describe("[P1-02] London time (P1-A CR-M1)", () => {
  it("gives the London date, which runs an hour ahead of UTC in summer and matches it in winter", () => {
    expect(londonDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(londonDate(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("round-trips a wall clock through the instant, including both clock-change days", () => {
    for (const iso of ["2026-03-29T00:30:00Z", "2026-07-15T12:00:00Z", "2026-10-25T00:30:00Z"]) {
      const ms = Date.parse(iso);
      expect(londonInstant(londonWall(ms)), iso).toBe(ms);
    }
    // 01:30 on the spring-forward day doesn't exist: the first instant after the gap (02:00 BST = 01:00 UTC).
    expect(new Date(londonInstant(Date.UTC(2026, 2, 29, 1, 30))).toISOString()).toBe(
      "2026-03-29T01:00:00.000Z",
    );
  });

  it("moves calendar dates across months and years, and refuses a non-date", () => {
    expect(addDays("2030-06-10", -1)).toBe("2030-06-09");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(() => addDays("10/06/2030", 1)).toThrow(RangeError);
  });
});
