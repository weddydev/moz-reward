/**
 * Open / closed status of a shop (P1-01, PRODUCT §4). Pure: the caller passes the shop's hours, special
 * closures and the current instant. All shops are in UK time (ARCHITECTURE §4; src/lib/time.ts).
 *
 * Each opening window is turned into real instants first, so "closes soon" counts real minutes on the nights
 * the clocks change, and an opening time inside the missing spring hour starts when the clocks reach 02:00.
 * Rules:
 *  - `closes <= opens` is an overnight window ending the next day; `24:00` is the end of the day.
 *  - A closure date has no opening that day, and an overnight window running into it stops at midnight.
 *  - Windows that touch or overlap (18:00–24:00 then 00:00–02:00) read as one.
 *  - `closes_soon` when 30 minutes or fewer remain; `opens_at` names the next opening within 7 days,
 *    otherwise `closed`.
 */
import { londonInstant as instantOf, londonWall } from "./time";

export type HoursRow = { weekday: number; opens: string; closes: string };
export type ClosureRow = { date: string };
export type OpenStatus =
  | { state: "open"; closesAt: string }
  | { state: "closes_soon"; closesAt: string; minutesLeft: number }
  | { state: "opens_at"; opensAt: string; date: string }
  | { state: "closed" };

export const CLOSES_SOON_MINUTES = 30;
const LOOKAHEAD_DAYS = 7;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const isoDate = (wallMs: number): string => new Date(wallMs).toISOString().slice(0, 10);
const hhmm = (wallMs: number): string => new Date(wallMs).toISOString().slice(11, 16);

function minutesOf(time: string): number {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  const h = Number(m?.[1]);
  const min = Number(m?.[2]);
  if (!m || h > 24 || min > 59 || (h === 24 && min !== 0))
    throw new RangeError(`not a time of day: "${time}"`);
  return h * 60 + min;
}

const isoWeekday = (dayMs: number): number => new Date(dayMs).getUTCDay() || 7;

export function openStatus(
  shop: { hours: readonly HoursRow[]; closures: readonly ClosureRow[] },
  now: Date,
): OpenStatus {
  const nowMs = now.getTime();
  const today = Math.floor(londonWall(nowMs) / DAY) * DAY;
  const closed = new Set(shop.closures.map((c) => c.date));

  const windows: { start: number; end: number }[] = [];
  for (let k = -1; k <= LOOKAHEAD_DAYS; k++) {
    const day = today + k * DAY;
    if (closed.has(isoDate(day))) continue;
    for (const row of shop.hours) {
      if (row.weekday !== isoWeekday(day)) continue;
      const opens = minutesOf(row.opens);
      const closes = minutesOf(row.closes);
      if (opens === closes) continue;
      let endWall = day + closes * MINUTE + (closes < opens ? DAY : 0);
      const nextDay = day + DAY;
      if (endWall > nextDay && closed.has(isoDate(nextDay))) endWall = nextDay;
      windows.push({ start: instantOf(day + opens * MINUTE), end: instantOf(endWall) });
    }
  }
  windows.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const w of windows) {
    const last = merged.at(-1);
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }

  const current = merged.find((w) => w.start <= nowMs && nowMs < w.end);
  if (current) {
    const closesAt = hhmm(londonWall(current.end));
    const minutesLeft = Math.ceil((current.end - nowMs) / MINUTE);
    return minutesLeft <= CLOSES_SOON_MINUTES
      ? { state: "closes_soon", closesAt, minutesLeft }
      : { state: "open", closesAt };
  }
  const next = merged.find((w) => w.start > nowMs);
  if (next) {
    const wall = londonWall(next.start);
    return { state: "opens_at", opensAt: hhmm(wall), date: isoDate(wall) };
  }
  return { state: "closed" };
}
