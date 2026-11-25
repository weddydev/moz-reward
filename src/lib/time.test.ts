import { describe, expect, it } from "vitest";
import {
  addDays,
  addLondonDays,
  addLondonMonths,
  londonDate,
  londonDayStart,
  londonInstant,
  londonWall,
  londonWeekStart,
} from "./time";

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

describe("[P1-06] London weeks and calendar arithmetic", () => {
  const at = (iso: string): Date => new Date(iso);

  it("starts the ISO week on Monday in London, not UTC", () => {
    // Sun 29 Mar 2026 23:30 UTC is Mon 30 Mar 00:30 BST: already the next week in London.
    expect(londonWeekStart(at("2026-03-29T23:30:00Z"))).toBe("2026-03-30");
    expect(londonWeekStart(at("2026-03-29T22:59:00Z"))).toBe("2026-03-23");
    // Sun 25 Oct 2026 23:30 UTC is Sun 23:30 GMT (clocks went back at 02:00): still the old week.
    expect(londonWeekStart(at("2026-10-25T23:30:00Z"))).toBe("2026-10-19");
    expect(londonWeekStart(at("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
    // A Monday is its own week start; a week that spans a year end starts in December.
    expect(londonWeekStart(at("2026-11-16T09:00:00Z"))).toBe("2026-11-16");
    expect(londonWeekStart(at("2027-01-01T12:00:00Z"))).toBe("2026-12-28");
  });

  it("adds calendar months on the London wall clock, clamping to the month's last day", () => {
    // 10:15:42 BST in July → 10:15:42 GMT in January (wall time kept across the clock change).
    expect(addLondonMonths(at("2026-07-14T09:15:42.500Z"), 6).toISOString()).toBe(
      "2027-01-14T10:15:42.500Z",
    );
    // 31 Jan + 1 month → 28 Feb (or 29 in a leap year); 31 Mar + 12 → 31 Mar.
    expect(addLondonMonths(at("2027-01-31T12:00:00Z"), 1).toISOString()).toBe(
      "2027-02-28T12:00:00.000Z",
    );
    expect(addLondonMonths(at("2028-01-31T12:00:00Z"), 1).toISOString()).toBe(
      "2028-02-29T12:00:00.000Z",
    );
    expect(addLondonMonths(at("2026-03-31T11:00:00Z"), 12).toISOString()).toBe(
      "2027-03-31T11:00:00.000Z",
    );
    // Landing in the missing spring hour (01:30 on 28 Mar 2027 doesn't exist) → 02:00 BST.
    expect(addLondonMonths(at("2026-02-28T01:30:00Z"), 13).toISOString()).toBe(
      "2027-03-28T01:00:00.000Z",
    );
  });

  it("subtracts London calendar days across a clock change, keeping the wall time", () => {
    // 1 Nov 2026 09:00 GMT minus 7 days → 25 Oct 09:00 GMT; minus 30 → 2 Oct 09:00 BST.
    expect(addLondonDays(at("2026-11-01T09:00:00Z"), -7).toISOString()).toBe(
      "2026-10-25T09:00:00.000Z",
    );
    expect(addLondonDays(at("2026-11-01T09:00:00Z"), -30).toISOString()).toBe(
      "2026-10-02T08:00:00.000Z",
    );
    expect(addLondonDays(at("2026-11-01T09:00:00Z"), 0).toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
  });

  it("refuses month or day counts that are not whole numbers", () => {
    expect(() => addLondonMonths(at("2026-01-01T00:00:00Z"), 1.5)).toThrow(RangeError);
    expect(() => addLondonDays(at("2026-01-01T00:00:00Z"), Number.NaN)).toThrow(RangeError);
  });
});

describe("[P1-11] London day start (daily request cap)", () => {
  it("is 00:00 UK time: midnight GMT in winter, 23:00 UTC the evening before in summer", () => {
    expect(londonDayStart(new Date("2026-01-15T16:55:00Z")).toISOString()).toBe(
      "2026-01-15T00:00:00.000Z",
    );
    expect(londonDayStart(new Date("2026-07-15T16:55:00Z")).toISOString()).toBe(
      "2026-07-14T23:00:00.000Z",
    );
    // 23:30 UTC on 14 Jul is 00:30 BST on 15 Jul: already the next UK day.
    expect(londonDayStart(new Date("2026-07-14T23:30:00Z")).toISOString()).toBe(
      "2026-07-14T23:00:00.000Z",
    );
  });

  it("handles both clock changes (the day is 23 or 25 hours long)", () => {
    // 29 Mar 2026: clocks go forward at 01:00 GMT; the day began at 00:00 GMT.
    expect(londonDayStart(new Date("2026-03-29T20:00:00Z")).toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
    // 25 Oct 2026: clocks go back at 01:00 UTC; the day began at 00:00 BST = 23:00 UTC on the 24th.
    expect(londonDayStart(new Date("2026-10-25T20:00:00Z")).toISOString()).toBe(
      "2026-10-24T23:00:00.000Z",
    );
  });
});
