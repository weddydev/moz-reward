/**
 * Ingot fill maths (P1-08, DESIGN §8.3): pure, shared by the Ingot SVG, the pour, the Wallet's progress label
 * and the Gold Vault page. Geometry is in the SVG's user units (viewBox `0 0 320 210`, the reference's ingot since PD-10).
 */

/** Whole percent of the ingot, rounded down: 999 of 1,000 reads 99%, never a full ingot that isn't. */
export function ingotPercent(progressGold: number, ingotSize: number): number {
  if (!(ingotSize > 0) || !(progressGold > 0)) return 0;
  return Math.min(100, Math.floor((progressGold * 100) / ingotSize));
}

export type IngotFill = {
  /** 0–1, exact (the picture), clamped: more gold than the ingot holds shows a full ingot. */
  fraction: number;
  /** Whole percent, rounded down (`ingotPercent`). */
  percent: number;
  /** Gold shown, clamped to the ingot size. */
  gold: number;
  size: number;
  /** What assistive tech reads: "720 of 1,000 gold, 72%". */
  label: string;
};

const gb = (n: number): string => n.toLocaleString("en-GB");

/**
 * The fill for `gold` in an ingot of `size`. Overflow from a multi-ingot award is carried into the next ingot
 * by the engine before it gets here (the membership's `progress_gold` is always the current ingot); a value
 * above `size` still draws a full ingot and never says more than 100%.
 */
export function ingotFill(gold: number, size: number): IngotFill {
  const safeSize = size > 0 && Number.isFinite(size) ? Math.floor(size) : 0;
  const shown = safeSize ? Math.max(0, Math.min(safeSize, Math.floor(gold) || 0)) : 0;
  const fraction = safeSize ? shown / safeSize : 0;
  const percent = ingotPercent(shown, safeSize);
  return {
    fraction,
    percent,
    gold: shown,
    size: safeSize,
    label: `${gb(shown)} of ${gb(safeSize)} gold, ${String(percent)}%`,
  };
}

/**
 * The mould in user units (the reference's `#ingot`, viewBox `0 0 320 210`; PD-10): the top face runs from y 40
 * to 62, the front face from 62 to 182. The liquid rises from `bottom` (empty) to `faceTop` (full); a full
 * ingot's top face turns gold instead of filling with liquid.
 */
export const INGOT_BOX = { width: 320, height: 210, top: 40, faceTop: 62, bottom: 182 } as const;

/** The liquid surface's y for a fill fraction: the reference's `182 − 120 × v / MAX`, clamped to 0–1. */
export const levelY = (fraction: number): number =>
  INGOT_BOX.bottom -
  (INGOT_BOX.bottom - INGOT_BOX.faceTop) * Math.min(1, Math.max(0, fraction || 0));

/** The mould's right edge at height `y` (milestone ticks sit just outside it): top face 236 → 250, front 250 → 292. */
export function mouldRightX(y: number): number {
  const { top, faceTop, bottom } = INGOT_BOX;
  if (y <= faceTop) return 236 + ((Math.max(top, y) - top) * 14) / (faceTop - top);
  return 250 + ((Math.min(bottom, y) - faceTop) * 42) / (bottom - faceTop);
}
