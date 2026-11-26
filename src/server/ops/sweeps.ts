import "server-only";
/**
 * Scheduled sweeps and their runtime alarms (ARCHITECTURE §4, §6: "each scheduled job has a runtime alarm: an
 * alert fires if a run exceeds its expected duration or does not run on schedule"). Each successful run records
 * its heartbeat (`sweep:<name>`) with the run's duration in ms; the health monitor raises `health.sweep` when a
 * sweep is late (no run within `everySec + graceSec`) or slow (last run over `maxRunSec`). Pure data, shared by
 * the job handlers and the health rules.
 */
export type SweepDef = {
  /** How often the schedule fires (scheduler.ts). */
  everySec: number;
  /** Lateness tolerated beyond the interval (start-up, queue lag, a slow previous run). */
  graceSec: number;
  /** A run longer than this is a warning sign (growth, lock waits) even when it finished. */
  maxRunSec: number;
};

export const SWEEPS = {
  /** P1-13: daily at 03:00 UK time; 100,000 members fit well inside 15 min. */
  "points-expiry": { everySec: 86_400, graceSec: 2 * 3_600, maxRunSec: 15 * 60 },
  /** P1-11: every 5 minutes. */
  "requests-expire": { everySec: 300, graceSec: 600, maxRunSec: 120 },
  "requests-remind": { everySec: 300, graceSec: 600, maxRunSec: 120 },
} as const satisfies Record<string, SweepDef>;

export type SweepName = keyof typeof SWEEPS;
export const SWEEP_NAMES = Object.keys(SWEEPS) as SweepName[];

export const sweepHeartbeat = (name: SweepName): string => `sweep:${name}`;
