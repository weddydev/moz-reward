/**
 * UK time for business rules (ENGINEERING §8; ARCHITECTURE §4: every shop is in Europe/London). This is the one
 * module that names the zone (lint: no "Europe/London" elsewhere in src); callers pass the instant in, so tests
 * and the cache never read a hidden clock. Stored times stay UTC (timestamptz).
 */
export const LONDON_TZ = "Europe/London";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const wallFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: LONDON_TZ });

/** The London wall clock at `ms`, as the UTC timestamp with the same digits (minute precision). */
export function londonWall(ms: number): number {
  const p: Record<string, number> = {};
  for (const part of wallFormat.formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return Date.UTC(p.year ?? 0, (p.month ?? 1) - 1, p.day ?? 1, p.hour ?? 0, p.minute ?? 0);
}

/**
 * The earliest instant whose London wall clock reads `wallMs`. In the missing spring hour, the first instant
 * after the gap (02:00 BST); in the repeated autumn hour, the first occurrence (BST).
 */
export function londonInstant(wallMs: number): number {
  for (let gap = 0; gap <= 60; gap++) {
    const wall = wallMs + gap * MINUTE;
    for (const offset of [60, 0]) {
      const utc = wall - offset * MINUTE;
      if (londonWall(utc) === wall) return utc;
    }
  }
  throw new Error("no London instant found within an hour"); // unreachable for Europe/London
}

/** The London calendar date at `now` (YYYY-MM-DD). */
export const londonDate = (now: Date): string => dateFormat.format(now);

/**
 * The instant the London day containing `now` began (00:00 UK time; P1-11 daily request cap). Across a clock
 * change the day is 23 or 25 hours long, so this is never `now` minus a fixed span.
 */
export const londonDayStart = (now: Date): Date =>
  new Date(londonInstant(Date.parse(`${londonDate(now)}T00:00:00Z`)));

/** A calendar date (YYYY-MM-DD) moved by whole days; no time zone involved. */
export function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new RangeError(`not a date: ${isoDate}`);
  return new Date(ms + days * DAY).toISOString().slice(0, 10);
}

/** The Monday (YYYY-MM-DD) of the ISO week that contains `now` in London (streaks, PRODUCT §6). */
export function londonWeekStart(now: Date): string {
  const date = londonDate(now);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

function wholeCount(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new RangeError(`${what} must be a whole number`);
}

/** Moves `at` along the London wall clock (offsets are whole hours, so seconds are carried as they are). */
function shiftWall(at: Date, move: (wall: Date) => number): Date {
  const ms = at.getTime();
  const subMinute = ((ms % MINUTE) + MINUTE) % MINUTE;
  return new Date(londonInstant(move(new Date(londonWall(ms)))) + subMinute);
}

/**
 * `at` plus whole calendar months in London, same wall time; a day the target month lacks becomes its last
 * day (31 Jan + 1 → 28/29 Feb). A wall time in the missing spring hour moves to 02:00 BST (`londonInstant`).
 */
export function addLondonMonths(at: Date, months: number): Date {
  wholeCount(months, "months");
  return shiftWall(at, (w) => {
    const target = w.getUTCMonth() + months;
    const lastDay = new Date(Date.UTC(w.getUTCFullYear(), target + 1, 0)).getUTCDate();
    return Date.UTC(
      w.getUTCFullYear(),
      target,
      Math.min(w.getUTCDate(), lastDay),
      w.getUTCHours(),
      w.getUTCMinutes(),
    );
  });
}

/** `at` plus whole calendar days in London, same wall time (a day across a clock change is 23 or 25 h). */
export function addLondonDays(at: Date, days: number): Date {
  wholeCount(days, "days");
  return shiftWall(at, (w) => w.getTime() + days * DAY);
}
