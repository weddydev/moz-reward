import { getNextMillis } from "bullmq";
import { describe, expect, it } from "vitest";
import { SCHEDULE_TZ, SCHEDULES } from "./scheduler";

/**
 * London wall-clock schedules (P0-04, ENGINEERING §8). Uses BullMQ's own next-run computation with the options
 * registerSchedules passes, so "06:00 every day" means 06:00 in London in both GMT and BST, including across
 * the clock changes (last Sunday of October and of March).
 */
const nextRun = (fromIso: string, pattern = "0 6 * * *"): string =>
  new Date(getNextMillis(Date.parse(fromIso), { pattern, tz: SCHEDULE_TZ }) ?? 0).toISOString();

describe("[P0-04] schedules run on Europe/London time", () => {
  it("06:00 London is 05:00Z in summer (BST) and 06:00Z in winter (GMT)", () => {
    expect(nextRun("2026-07-01T00:00:00Z")).toBe("2026-07-01T05:00:00.000Z");
    expect(nextRun("2026-11-09T00:00:00Z")).toBe("2026-11-09T06:00:00.000Z");
  });

  it("follows the October change (Sun 25 Oct 2026: BST → GMT)", () => {
    expect(nextRun("2026-10-24T05:30:00Z")).toBe("2026-10-25T06:00:00.000Z");
  });

  it("follows the March change (Sun 28 Mar 2027: GMT → BST)", () => {
    expect(nextRun("2027-03-27T06:30:00Z")).toBe("2027-03-28T05:00:00.000Z");
  });

  it("crosses month and year boundaries", () => {
    expect(nextRun("2026-12-31T23:59:00Z", "0 0 1 * *")).toBe("2027-01-01T00:00:00.000Z");
    // 30 Jun 23:30Z is already 1 Jul 00:30 in London (BST), so the next 1st-of-month midnight is 1 Aug.
    expect(nextRun("2026-06-30T23:30:00Z", "0 0 1 * *")).toBe("2026-07-31T23:00:00.000Z");
  });

  it("every registered schedule has a valid pattern and a unique id", () => {
    const ids = SCHEDULES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCHEDULES)
      expect(nextRun("2026-11-09T00:00:00Z", s.pattern)).not.toBe(new Date(0).toISOString());
  });
});
