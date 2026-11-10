import "server-only";

/**
 * Log-spike guard (P0-13 edge case "log volume spikes"): while Redis is down every BullMQ worker emits a
 * connection error several times a second. The first of each kind is logged at once; repeats inside the window
 * are only counted and reported with the next line after the window (`repeated: n`). Bounded memory.
 */
export type LogThrottle = ((key: string, emit: (repeated: number) => void) => void) & {
  size(): number;
};

export function createLogThrottle(opts: {
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): LogThrottle {
  const now = opts.now ?? Date.now;
  const maxKeys = opts.maxKeys ?? 200;
  const seen = new Map<string, { since: number; held: number }>();
  const throttle = ((key, emit) => {
    const t = now();
    const slot = seen.get(key);
    if (slot && t - slot.since < opts.windowMs) {
      slot.held++;
      return;
    }
    if (!slot && seen.size >= maxKeys) {
      const oldest = seen.keys().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    seen.set(key, { since: t, held: 0 });
    emit(slot?.held ?? 0);
  }) as LogThrottle;
  throttle.size = () => seen.size;
  return throttle;
}
