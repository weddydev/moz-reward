/** Wallet pull-to-refresh distances in CSS px (P1-07). */
export const PULL_THRESHOLD = 64;
export const PULL_MAX = 96;
/** The outline moves half as far as the finger (resistance), never upwards, never past `PULL_MAX`. */
export const pullDistance = (fingerDy: number): number =>
  Number.isFinite(fingerDy) && fingerDy > 0 ? Math.min(PULL_MAX, fingerDy / 2) : 0;
