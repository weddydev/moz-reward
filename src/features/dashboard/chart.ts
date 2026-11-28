/**
 * The weekly visits chart's scale (P2-01, DESIGN §6 charts): each bar's height as a percentage of the busiest
 * day. Pure, so the empty shop (all zeros, no NaN) and the small-day minimum are unit-tested.
 */

/** A day with any visits never draws thinner than this (a 1-visit day beside a 1,000-visit day stays visible). */
export const MIN_BAR_PCT = 4;

const clean = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Bar heights (0–100, one decimal) for `values`; all zeros when there is nothing to show. */
export function barHeights(values: readonly number[]): number[] {
  const safe = values.map(clean);
  const max = Math.max(0, ...safe);
  if (max === 0) return safe.map(() => 0);
  return safe.map((v) => (v === 0 ? 0 : Math.max(MIN_BAR_PCT, Math.round((v / max) * 1000) / 10)));
}
