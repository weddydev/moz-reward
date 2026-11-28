import { describe, expect, it } from "vitest";
import { changePercent, londonDays, seriesFor, sumSince, weekStartDate } from "./kpis";

const HOUR = 3_600_000;

describe("[P2-01] londonDays", () => {
  it("[P2-01] gives today and the six days before it, oldest first, in UK dates", () => {
    const days = londonDays(new Date("2026-11-28T12:00:00Z"));
    expect(days.map((d) => d.date)).toEqual([
      "2026-11-22",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
    ]);
    // GMT in November: midnight UK is midnight UTC.
    expect(days[6]?.start.toISOString()).toBe("2026-11-28T00:00:00.000Z");
    expect(days[6]?.end.toISOString()).toBe("2026-11-29T00:00:00.000Z");
  });

  it("[P2-01] uses the UK date, not the UTC date, just after midnight in summer", () => {
    // 23:30 UTC on 14 Jul is 00:30 BST on 15 Jul.
    const days = londonDays(new Date("2026-07-14T23:30:00Z"));
    expect(days.at(-1)?.date).toBe("2026-07-15");
    expect(days.at(-1)?.start.toISOString()).toBe("2026-07-14T23:00:00.000Z");
  });

  it("[P2-01] makes the spring clock-change day 23 hours long", () => {
    const days = londonDays(new Date("2026-03-29T12:00:00Z"));
    const day = days.at(-1);
    expect(day?.date).toBe("2026-03-29");
    expect(day?.start.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(day?.end.toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect((day?.end.getTime() ?? 0) - (day?.start.getTime() ?? 0)).toBe(23 * HOUR);
  });

  it("[P2-01] makes the autumn clock-change day 25 hours long", () => {
    const days = londonDays(new Date("2026-10-25T12:00:00Z"));
    const day = days.at(-1);
    expect(day?.date).toBe("2026-10-25");
    expect(day?.start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(day?.end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect((day?.end.getTime() ?? 0) - (day?.start.getTime() ?? 0)).toBe(25 * HOUR);
  });

  it("[P2-01] leaves no gap and no overlap between the days across a clock change", () => {
    const days = londonDays(new Date("2026-10-28T09:00:00Z"));
    for (let i = 1; i < days.length; i++) {
      expect(days[i]?.start.getTime()).toBe(days[i - 1]?.end.getTime());
    }
  });

  it("[P2-01] puts 23:59:59 and 00:00:00 UK on either side of midnight", () => {
    const days = londonDays(new Date("2026-11-28T12:00:00Z"));
    const yesterday = days[5];
    const today = days[6];
    const lastSecond = new Date("2026-11-27T23:59:59Z").getTime();
    const firstSecond = new Date("2026-11-28T00:00:00Z").getTime();
    expect(lastSecond >= (yesterday?.start.getTime() ?? 0)).toBe(true);
    expect(lastSecond < (yesterday?.end.getTime() ?? 0)).toBe(true);
    expect(firstSecond >= (today?.start.getTime() ?? 0)).toBe(true);
  });
});

describe("[P2-01] seriesFor and sums", () => {
  const days = londonDays(new Date("2026-11-28T12:00:00Z"));

  it("[P2-01] fills days with no rows with 0, in day order", () => {
    const series = seriesFor(
      days,
      new Map([
        ["2026-11-28", 5],
        ["2026-11-22", 2],
        ["2026-11-01", 99], // outside the window: ignored
      ]),
    );
    expect(series).toEqual([2, 0, 0, 0, 0, 0, 5]);
  });

  it("[P2-01] sums from the Monday of this UK week", () => {
    // Saturday 28 Nov 2026: the week began Monday 23 Nov.
    expect(weekStartDate(new Date("2026-11-28T12:00:00Z"))).toBe("2026-11-23");
    const series = [1, 2, 3, 4, 5, 6, 7];
    expect(sumSince(days, series, "2026-11-23")).toBe(2 + 3 + 4 + 5 + 6 + 7);
  });

  it("[P2-01] counts only today when today is Monday", () => {
    const monday = londonDays(new Date("2026-11-30T08:00:00Z"));
    expect(weekStartDate(new Date("2026-11-30T08:00:00Z"))).toBe("2026-11-30");
    expect(sumSince(monday, [9, 9, 9, 9, 9, 9, 4], "2026-11-30")).toBe(4);
  });
});

describe("[P2-01] changePercent", () => {
  it("[P2-01] rounds the change against the previous value", () => {
    expect(changePercent(42, 34)).toBe(24);
    expect(changePercent(30, 40)).toBe(-25);
    expect(changePercent(5, 5)).toBe(0);
  });

  it("[P2-01] has no change when there is nothing to compare with", () => {
    expect(changePercent(7, 0)).toBeNull();
    expect(changePercent(0, 0)).toBeNull();
  });
});
