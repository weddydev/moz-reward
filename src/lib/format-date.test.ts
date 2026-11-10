import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, londonDay } from "./format-date";

describe("[P0-06] UK date formatting (CLAUDE.md §5: `7 Nov 2026`, 24h)", () => {
  it("formats dates as day, short month, year in UK time", () => {
    expect(formatDate(new Date("2026-11-07T12:00:00Z"))).toBe("7 Nov 2026");
    expect(formatDate(new Date("2026-09-15T12:00:00Z"))).toBe("15 Sep 2026"); // not ICU's "Sept"
  });

  it("uses London time across the day boundary and in summer time", () => {
    expect(formatDate(new Date("2026-07-01T23:30:00Z"))).toBe("2 Jul 2026"); // 00:30 BST
    expect(formatDateTime(new Date("2026-07-01T23:30:00Z"))).toBe("2 Jul 2026, 00:30");
    expect(formatDateTime(new Date("2026-12-01T17:05:00Z"))).toBe("1 Dec 2026, 17:05"); // GMT
  });
});

describe("[P0-13] londonDay: daily counters reset at UK midnight", () => {
  it("uses the UK calendar day in BST and GMT", () => {
    expect(londonDay(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02"); // 00:30 BST
    expect(londonDay(new Date("2026-07-01T22:59:00Z"))).toBe("2026-07-01"); // 23:59 BST
    expect(londonDay(new Date("2026-12-01T23:59:00Z"))).toBe("2026-12-01"); // GMT
    expect(londonDay(new Date("2027-01-09T00:00:00Z"))).toBe("2027-01-09");
  });
});
