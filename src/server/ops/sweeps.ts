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
  /**
   * The audit row of a run that changed rows (SECURITY §3; security review M2, P1-C close): the table it
   * changes, and the counters in its result that count changed rows. Empty runs write none (DECISIONS P0-20).
   */
  audit: { entity: string; changes: readonly string[] };
};

export const SWEEPS = {
  /** P1-13: daily at 03:00 UK time; 100,000 members fit well inside 15 min. */
  "points-expiry": {
    everySec: 86_400,
    graceSec: 2 * 3_600,
    maxRunSec: 15 * 60,
    audit: { entity: "memberships", changes: ["warned30", "warned7", "expired", "forfeited"] },
  },
  /** P1-17: daily at 04:00 UK time; read-only (it records issues, never changes business rows). */
  "integrity-check": {
    everySec: 86_400,
    graceSec: 2 * 3_600,
    maxRunSec: 15 * 60,
    audit: { entity: "integrity_issues", changes: ["newIssues"] },
  },
  /** P1-11: every 5 minutes. */
  "requests-expire": {
    everySec: 300,
    graceSec: 600,
    maxRunSec: 120,
    audit: { entity: "point_requests", changes: ["expired"] },
  },
  "requests-remind": {
    everySec: 300,
    graceSec: 600,
    maxRunSec: 120,
    audit: { entity: "point_requests", changes: ["reminded"] },
  },
} as const satisfies Record<string, SweepDef>;

export type SweepName = keyof typeof SWEEPS;
export const SWEEP_NAMES = Object.keys(SWEEPS) as SweepName[];

export const sweepHeartbeat = (name: SweepName): string => `sweep:${name}`;
