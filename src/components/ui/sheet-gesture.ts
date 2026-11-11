/**
 * BottomSheet drag rules (P0-09 AC 11), pure so they are unit-tested apart from the DOM.
 * A drag down past 25% of the sheet's height, or a downward flick faster than 0.5 px/ms, closes it;
 * anything less springs back.
 */
export const CLOSE_DISTANCE_RATIO = 0.25;
/** px per ms, measured over the last {@link VELOCITY_WINDOW_MS} of the drag. */
export const CLOSE_VELOCITY = 0.5;
export const VELOCITY_WINDOW_MS = 100;
/** Furthest an upward drag can lift the sheet (it is already fully open). */
export const MAX_LIFT_PX = 24;

export type DragSample = { y: number; t: number };

export function shouldCloseSheet({
  distance,
  velocity,
  height,
}: {
  /** Net downward movement in px since the drag started (negative = up). */
  distance: number;
  /** Release velocity in px/ms (positive = down). */
  velocity: number;
  /** The sheet's height in px. */
  height: number;
}): boolean {
  if (!(distance > 0)) return false;
  if (height > 0 && distance >= height * CLOSE_DISTANCE_RATIO) return true;
  return velocity > CLOSE_VELOCITY;
}

/**
 * Velocity at release over the last ~100ms (from the last sample at or before that window, else the first),
 * so a slow drag that ends in a flick reads as a flick and a drag that paused before release reads as ~0.
 */
export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples.at(-1);
  if (!last || samples.length < 2) return 0;
  const cutoff = last.t - VELOCITY_WINDOW_MS;
  let from = samples[0];
  for (const s of samples) {
    if (s.t <= cutoff) from = s;
    else break;
  }
  if (!from) return 0;
  const dt = last.t - from.t;
  return dt > 0 ? (last.y - from.y) / dt : 0;
}

/** Where the sheet sits for a finger offset: 1:1 downwards, growing friction upwards, capped. */
export function dragOffset(delta: number): number {
  if (delta >= 0) return delta;
  return -Math.min(MAX_LIFT_PX, Math.sqrt(-delta) * 3);
}
