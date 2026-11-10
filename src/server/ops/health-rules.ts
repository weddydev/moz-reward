import "server-only";
import type { Alert } from "./alerts";

/**
 * Health snapshot and alert thresholds (P0-13, ARCHITECTURE §10–§11). Pure: the worker's health monitor
 * collects a snapshot every minute (monitor.ts), evaluates it here and raises the alerts (deduplicated per kind,
 * alerts.ts); the admin System page shows the same snapshot. `null` = the value could not be read this tick
 * (its own check — db/redis — alerts instead), never a reason for a false alarm on its own.
 */
export type HealthSnapshot = {
  takenAt: string;
  db: { ok: boolean; ms: number; sizeBytes: number | null };
  redis: { ok: boolean; ms: number };
  /** redis-cache: fail-open by design (P0-18), shown but never an alert on its own. */
  cache: { ok: boolean; ms: number };
  scheduler: { lastRunAt: string | null };
  queues: Array<{
    name: string;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    /** Age of the oldest job waiting to start, in seconds (0 when none waits). */
    lagSec: number;
  }>;
  outbox: { pending: number | null; oldestAgeSec: number | null };
  /** Dead-lettered jobs: still unresolved, and new since the previous tick's window (10 min). */
  failedJobs: { unresolved: number | null; recent: number | null };
  disk: { path: string; usedPct: number | null };
  /** Written by the backup jobs (P0-15) as job_heartbeats rows; checked only when BACKUPS_ENABLED. */
  backups: {
    enabled: boolean;
    lastDumpAt: string | null;
    lastWalAt: string | null;
    lastRestoreDrillAt: string | null;
  };
  email: { sentToday: number | null; cap: number };
  sentry: { sentThisMonth: number | null; quota: number };
  /** SSE connections (P1-10 adds the counter). */
  sse: { connections: number | null };
};

export const THRESHOLDS = {
  queueLagSec: 60,
  outboxAgeSec: 120,
  schedulerStaleSec: 180,
  diskPct: 80,
  quotaPct: 70,
  dumpMaxHours: 26,
  walMaxMin: 10,
  drillMaxDays: 35,
} as const;

const ageSec = (iso: string | null, now: Date): number | null =>
  iso === null ? null : Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);

const pct = (used: number | null, cap: number): number | null =>
  used === null || cap <= 0 ? null : (used / cap) * 100;

export function evaluateHealth(s: HealthSnapshot, now: Date): Alert[] {
  const out: Alert[] = [];
  const ops = (kind: Alert["kind"], detail: Record<string, unknown>): void => {
    out.push({ kind, category: "ops", detail });
  };

  if (!s.db.ok) ops("health.db", { ms: s.db.ms });
  if (!s.redis.ok) ops("health.redis", { ms: s.redis.ms });

  const schedulerAge = ageSec(s.scheduler.lastRunAt, now);
  if (s.db.ok && (schedulerAge === null || schedulerAge > THRESHOLDS.schedulerStaleSec)) {
    ops("health.scheduler", { lastRunAgeSec: schedulerAge });
  }

  const lagging = s.queues
    .filter((q) => q.lagSec > THRESHOLDS.queueLagSec)
    .sort((a, b) => b.lagSec - a.lagSec);
  const worst = lagging[0];
  if (worst) {
    ops("health.queue_lag", {
      queue: worst.name,
      lagSec: worst.lagSec,
      waiting: worst.waiting,
      ...(lagging.length > 1 ? { alsoLagging: lagging.slice(1).map((q) => q.name) } : {}),
    });
  }

  if (s.outbox.oldestAgeSec !== null && s.outbox.oldestAgeSec > THRESHOLDS.outboxAgeSec) {
    ops("outbox.stale", { count: s.outbox.pending, oldestAgeSec: s.outbox.oldestAgeSec });
  }

  if ((s.failedJobs.recent ?? 0) > 0) {
    ops("health.failed_jobs", { recent: s.failedJobs.recent, unresolved: s.failedJobs.unresolved });
  }

  if (s.disk.usedPct !== null && s.disk.usedPct >= THRESHOLDS.diskPct) {
    ops("health.disk", { path: s.disk.path, usedPct: Math.round(s.disk.usedPct) });
  }

  if (s.backups.enabled) {
    const dump = ageSec(s.backups.lastDumpAt, now);
    const wal = ageSec(s.backups.lastWalAt, now);
    const drill = ageSec(s.backups.lastRestoreDrillAt, now);
    const dumpHours = dump === null ? null : Math.floor(dump / 3600);
    const walMin = wal === null ? null : Math.floor(wal / 60);
    const drillDays = drill === null ? null : Math.floor(drill / 86400);
    if (
      dump === null ||
      dump > THRESHOLDS.dumpMaxHours * 3600 ||
      wal === null ||
      wal > THRESHOLDS.walMaxMin * 60 ||
      drill === null ||
      drill > THRESHOLDS.drillMaxDays * 86400
    ) {
      ops("health.backup", { dumpAgeHours: dumpHours, walAgeMin: walMin, drillAgeDays: drillDays });
    }
  }

  const emailPct = pct(s.email.sentToday, s.email.cap);
  if (emailPct !== null && emailPct >= THRESHOLDS.quotaPct) {
    ops("quota.email", { sentToday: s.email.sentToday, cap: s.email.cap });
  }
  const sentryPct = pct(s.sentry.sentThisMonth, s.sentry.quota);
  if (sentryPct !== null && sentryPct >= THRESHOLDS.quotaPct) {
    ops("quota.sentry", { sentThisMonth: s.sentry.sentThisMonth, quota: s.sentry.quota });
  }
  return out;
}
