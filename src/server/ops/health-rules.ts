import "server-only";
import { z } from "zod";
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
  /** `uptimeSec`: how long the monitoring worker has run (a fresh worker hasn't had its first heartbeat yet). */
  scheduler: { lastRunAt: string | null; uptimeSec: number };
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
  /**
   * Written by the backup jobs (P0-15, infra/host/moz-backup) as job_heartbeats rows; checked only when
   * BACKUPS_ENABLED. The `...FailedAt` rows are written when a run fails: newer than the last success = alert now.
   */
  backups: {
    enabled: boolean;
    lastDumpAt: string | null;
    lastWalAt: string | null;
    lastRestoreDrillAt: string | null;
    lastDumpFailedAt: string | null;
    lastRestoreDrillFailedAt: string | null;
  };
  email: { sentToday: number | null; cap: number };
  sentry: { sentThisMonth: number | null; quota: number };
  /** SSE connections (P1-10 adds the counter). */
  sse: { connections: number | null };
};

const n = z.number();
const nn = z.number().nullable();
const iso = z.string().nullable();
/** Validates a stored snapshot before the System page renders it (an old or malformed row can't crash it). */
export const healthSnapshotSchema: z.ZodType<HealthSnapshot> = z.object({
  takenAt: z.string(),
  db: z.object({ ok: z.boolean(), ms: n, sizeBytes: nn }),
  redis: z.object({ ok: z.boolean(), ms: n }),
  cache: z.object({ ok: z.boolean(), ms: n }),
  scheduler: z.object({ lastRunAt: iso, uptimeSec: n }),
  queues: z.array(
    z.object({ name: z.string(), waiting: n, active: n, delayed: n, failed: n, lagSec: n }),
  ),
  outbox: z.object({ pending: nn, oldestAgeSec: nn }),
  failedJobs: z.object({ unresolved: nn, recent: nn }),
  disk: z.object({ path: z.string(), usedPct: nn }),
  backups: z.object({
    enabled: z.boolean(),
    lastDumpAt: iso,
    lastWalAt: iso,
    lastRestoreDrillAt: iso,
    // Added in P0-15 D1: snapshots stored before then have no such field.
    lastDumpFailedAt: iso.default(null),
    lastRestoreDrillFailedAt: iso.default(null),
  }),
  email: z.object({ sentToday: nn, cap: n }),
  sentry: z.object({ sentThisMonth: nn, quota: n }),
  sse: z.object({ connections: nn }),
});

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

/** A failure heartbeat counts until a success newer than it is recorded. */
const failedSinceSuccess = (failedAt: string | null, okAt: string | null): boolean =>
  failedAt !== null && (okAt === null || new Date(failedAt).getTime() > new Date(okAt).getTime());

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
  const pastGrace = s.scheduler.uptimeSec > THRESHOLDS.schedulerStaleSec;
  if (
    s.db.ok &&
    pastGrace &&
    (schedulerAge === null || schedulerAge > THRESHOLDS.schedulerStaleSec)
  ) {
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
    const dumpFailed = failedSinceSuccess(s.backups.lastDumpFailedAt, s.backups.lastDumpAt);
    const drillFailed = failedSinceSuccess(
      s.backups.lastRestoreDrillFailedAt,
      s.backups.lastRestoreDrillAt,
    );
    if (
      dumpFailed ||
      drillFailed ||
      dump === null ||
      dump > THRESHOLDS.dumpMaxHours * 3600 ||
      wal === null ||
      wal > THRESHOLDS.walMaxMin * 60 ||
      drill === null ||
      drill > THRESHOLDS.drillMaxDays * 86400
    ) {
      ops("health.backup", {
        dumpAgeHours: dumpHours,
        walAgeMin: walMin,
        drillAgeDays: drillDays,
        dumpFailed,
        drillFailed,
      });
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
