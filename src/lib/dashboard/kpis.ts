/**
 * Shop dashboard KPI maths (P2-01, PRODUCT §14 Overview). Pure: callers pass the instant in. Days and weeks
 * are UK days (ENGINEERING §8): a day across a clock change is 23 or 25 hours, so every boundary comes from
 * `londonInstant`, never from "now minus 24 h".
 */
import { addDays, londonDate, londonInstant, londonWeekStart } from "@/lib/time";

/** Points on each KPI sparkline and bars on the visits chart: today and the six days before it. */
export const DASHBOARD_DAYS = 7;

export type DayBucket = { date: string; start: Date; end: Date };

/** One UK day's totals for a shop (the dashboard repo reads them; P2-01). */
export type DayTotals = { visits: number; gold: number; joins: number };

const dayStart = (date: string): Date => new Date(londonInstant(Date.parse(`${date}T00:00:00Z`)));

/** The last `count` UK days ending today, oldest first; each `[start, end)` is that day's span. */
export function londonDays(now: Date, count: number = DASHBOARD_DAYS): DayBucket[] {
  const today = londonDate(now);
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(today, i - (count - 1));
    return { date, start: dayStart(date), end: dayStart(addDays(date, 1)) };
  });
}

/** The Monday (YYYY-MM-DD) of the UK week containing `now`: "this week" starts Monday 00:00 UK time. */
export const weekStartDate = (now: Date): string => londonWeekStart(now);

/** One value per day, in day order; a day with no row is 0 and dates outside the window are ignored. */
export function seriesFor(
  days: readonly DayBucket[],
  byDate: ReadonlyMap<string, number>,
): number[] {
  return days.map((d) => byDate.get(d.date) ?? 0);
}

/** The sum of the series over the days on or after `fromDate` (YYYY-MM-DD compares as text). */
export function sumSince(
  days: readonly DayBucket[],
  series: readonly number[],
  fromDate: string,
): number {
  return days.reduce((sum, d, i) => (d.date >= fromDate ? sum + (series[i] ?? 0) : sum), 0);
}

/** Whole-percent change from `previous` to `current`; null when there is nothing to compare with. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
