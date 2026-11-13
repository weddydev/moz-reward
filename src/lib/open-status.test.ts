import { describe, expect, it } from "vitest";
import { type HoursRow, openStatus } from "./open-status";

/** Mon–Fri 09:00–17:00 (ISO weekdays 1–5). */
const WEEKDAYS: HoursRow[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  opens: "09:00",
  closes: "17:00",
}));
/** Every day 18:00–02:00 (overnight). */
const NIGHTLY: HoursRow[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  opens: "18:00",
  closes: "02:00",
}));

/** A UTC instant from an ISO string with an explicit offset. */
const at = (iso: string): Date => new Date(iso);

describe("[P1-01] openStatus (Europe/London)", () => {
  it("normal day: open mid-morning, with the closing time", () => {
    // Wed 11 Nov 2026, 11:00 GMT
    expect(openStatus({ hours: WEEKDAYS, closures: [] }, at("2026-11-11T11:00:00Z"))).toEqual({
      state: "open",
      closesAt: "17:00",
    });
  });

  it("closes soon at exactly 30 minutes left, open at 31", () => {
    const s = { hours: WEEKDAYS, closures: [] };
    expect(openStatus(s, at("2026-11-11T16:30:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "17:00",
      minutesLeft: 30,
    });
    expect(openStatus(s, at("2026-11-11T16:29:00Z"))).toEqual({
      state: "open",
      closesAt: "17:00",
    });
  });

  it("closed at the closing minute itself, before opening (opens today) and after (opens tomorrow)", () => {
    const s = { hours: WEEKDAYS, closures: [] };
    expect(openStatus(s, at("2026-11-11T17:00:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-11-12",
    });
    expect(openStatus(s, at("2026-11-11T07:15:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-11-11",
    });
    expect(openStatus(s, at("2026-11-11T09:00:00Z"))).toMatchObject({ state: "open" });
  });

  it("weekend: Friday evening points to Monday", () => {
    // Fri 13 Nov 2026 18:00 → Mon 16 Nov 09:00
    expect(openStatus({ hours: WEEKDAYS, closures: [] }, at("2026-11-13T18:00:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-11-16",
    });
  });

  it("overnight 18:00–02:00: open before midnight, open after midnight, closes soon at 01:45", () => {
    const s = { hours: NIGHTLY, closures: [] };
    expect(openStatus(s, at("2026-11-11T23:00:00Z"))).toEqual({ state: "open", closesAt: "02:00" });
    expect(openStatus(s, at("2026-11-12T00:30:00Z"))).toEqual({ state: "open", closesAt: "02:00" });
    expect(openStatus(s, at("2026-11-12T01:45:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "02:00",
      minutesLeft: 15,
    });
    expect(openStatus(s, at("2026-11-12T02:00:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "18:00",
      date: "2026-11-12",
    });
  });

  it("overnight window started on a day that has no hours of its own the next day still counts", () => {
    // Only Saturday 22:00–03:00. Sunday 01:00 is inside Saturday's window.
    const s = { hours: [{ weekday: 6, opens: "22:00", closes: "03:00" }], closures: [] };
    expect(openStatus(s, at("2026-11-15T01:00:00Z"))).toEqual({ state: "open", closesAt: "03:00" });
  });

  it("closure day: no opening that day, and the next opening is the day after", () => {
    const s = { hours: WEEKDAYS, closures: [{ date: "2026-11-11" }] };
    expect(openStatus(s, at("2026-11-11T11:00:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-11-12",
    });
  });

  it("an overnight window ending inside a closure day stops at midnight (the closure wins)", () => {
    const s = { hours: NIGHTLY, closures: [{ date: "2026-11-12" }] };
    expect(openStatus(s, at("2026-11-11T23:40:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "00:00",
      minutesLeft: 20,
    });
    expect(openStatus(s, at("2026-11-12T00:30:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "18:00",
      date: "2026-11-13",
    });
  });

  it("no hours set: closed", () => {
    expect(openStatus({ hours: [], closures: [] }, at("2026-11-11T11:00:00Z"))).toEqual({
      state: "closed",
    });
  });

  it("every day closed for the next week: closed", () => {
    const closures = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-11-${String(10 + i).padStart(2, "0")}`,
    }));
    expect(openStatus({ hours: WEEKDAYS, closures }, at("2026-11-11T11:00:00Z"))).toEqual({
      state: "closed",
    });
  });

  it("BST start (29 Mar 2026): local times, not UTC, decide", () => {
    // 16:45 BST = 15:45 UTC → 15 minutes left in a 09:00–17:00 Sunday.
    const sunday = { hours: [{ weekday: 7, opens: "09:00", closes: "17:00" }], closures: [] };
    expect(openStatus(sunday, at("2026-03-29T15:45:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "17:00",
      minutesLeft: 15,
    });
    expect(openStatus(sunday, at("2026-03-29T08:30:00Z"))).toMatchObject({ state: "open" });
  });

  it("BST start: an opening inside the missing hour is treated as 02:00", () => {
    const s = { hours: [{ weekday: 7, opens: "01:30", closes: "05:00" }], closures: [] };
    // 00:30 GMT, before the clocks go forward at 01:00 GMT.
    expect(openStatus(s, at("2026-03-29T00:30:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "02:00",
      date: "2026-03-29",
    });
    // 01:00 UTC = 02:00 BST: open.
    expect(openStatus(s, at("2026-03-29T01:00:00Z"))).toEqual({ state: "open", closesAt: "05:00" });
  });

  it("BST start: an overnight window across the change counts real minutes to closing", () => {
    // Sat 28 Mar 22:00 – Sun 03:00. At 00:45 GMT the close (03:00 BST = 02:00 UTC) is 75 real minutes away.
    const s = { hours: [{ weekday: 6, opens: "22:00", closes: "03:00" }], closures: [] };
    expect(openStatus(s, at("2026-03-29T00:45:00Z"))).toEqual({ state: "open", closesAt: "03:00" });
    expect(openStatus(s, at("2026-03-29T01:30:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "03:00",
      minutesLeft: 30,
    });
  });

  it("BST end (25 Oct 2026): after 01:00 UTC the clocks read GMT, so 09:00 is 09:00 UTC", () => {
    const sunday = { hours: [{ weekday: 7, opens: "09:00", closes: "17:00" }], closures: [] };
    expect(openStatus(sunday, at("2026-10-25T08:59:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-10-25",
    });
    expect(openStatus(sunday, at("2026-10-25T09:00:00Z"))).toMatchObject({ state: "open" });
    // The day before is still BST: Saturday 09:00 BST = 08:00 UTC.
    const saturday = { hours: [{ weekday: 6, opens: "09:00", closes: "17:00" }], closures: [] };
    expect(openStatus(saturday, at("2026-10-24T08:00:00Z"))).toMatchObject({ state: "open" });
    expect(openStatus(sunday, at("2026-10-25T16:45:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "17:00",
      minutesLeft: 15,
    });
  });

  it("BST end: an overnight window across the change gets the extra hour", () => {
    // Sat 24 Oct 22:00 BST – Sun 02:00 GMT. At 00:30 UTC (01:30 BST) 90 real minutes remain.
    const s = { hours: [{ weekday: 6, opens: "22:00", closes: "02:00" }], closures: [] };
    expect(openStatus(s, at("2026-10-25T00:30:00Z"))).toEqual({ state: "open", closesAt: "02:00" });
    expect(openStatus(s, at("2026-10-25T01:31:00Z"))).toEqual({
      state: "closes_soon",
      closesAt: "02:00",
      minutesLeft: 29,
    });
  });

  it("split day and back-to-back windows: a lunch break, and 18:00–24:00 + 00:00–02:00 read as one", () => {
    const split = {
      hours: [
        { weekday: 3, opens: "09:00", closes: "12:00" },
        { weekday: 3, opens: "13:00", closes: "17:00" },
      ],
      closures: [],
    };
    expect(openStatus(split, at("2026-11-11T12:30:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "13:00",
      date: "2026-11-11",
    });
    const joined = {
      hours: [
        { weekday: 3, opens: "18:00", closes: "24:00" },
        { weekday: 4, opens: "00:00", closes: "02:00" },
      ],
      closures: [],
    };
    expect(openStatus(joined, at("2026-11-11T23:45:00Z"))).toEqual({
      state: "open",
      closesAt: "02:00",
    });
  });

  it("accepts HH:MM:SS from the database and ignores an empty window", () => {
    const s = {
      hours: [
        { weekday: 3, opens: "09:00:00", closes: "17:00:00" },
        { weekday: 3, opens: "20:00", closes: "20:00" },
      ],
      closures: [],
    };
    // Only Wednesdays have hours: next Wednesday.
    expect(openStatus(s, at("2026-11-11T19:00:00Z"))).toEqual({
      state: "opens_at",
      opensAt: "09:00",
      date: "2026-11-18",
    });
  });
});
