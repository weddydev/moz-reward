import "server-only";
import { stat, statfs } from "node:fs/promises";
import { systemScope } from "@/server/authz/scope";
import { cacheRedis } from "@/server/cache";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { type Alerter, type RaiseResult, sharedAlerter } from "@/server/ops/alerts";
import {
  BACKUP_STORAGE_BUDGET_BYTES,
  evaluateHealth,
  type HealthSnapshot,
} from "@/server/ops/health-rules";
import { readUsage } from "@/server/ops/usage";
import {
  archiverStatus,
  databaseSizeBytes,
  failedJobStats,
  heartbeats,
  writeOpsSnapshot,
} from "@/server/repos/ops";
import { staleOutbox } from "@/server/repos/outbox";
import { limiterRedis } from "@/server/security/rate-limit";
import { HEARTBEAT_NAME } from "./handlers";
import { getQueue } from "./queues";
import { QUEUE_NAMES } from "./registry";
import type { Redis } from "ioredis";

/**
 * The health monitor (P0-13, ARCHITECTURE §11): runs inside the worker process on its own timer, **not** as a
 * BullMQ job, so it keeps checking — and emailing — while redis-queue is down. Every minute it collects a
 * snapshot, evaluates the thresholds (health-rules.ts), raises the alerts (deduplicated per kind) and flushes
 * the held-back counts, stores the snapshot for the admin System page and marks itself alive in Redis for
 * `/api/health/worker`. One worker process at launch (ARCHITECTURE §9), so no cross-process lock: a second
 * one would only add duplicate checks, and alerts are deduplicated in Redis.
 */
export const HEALTH_INTERVAL_MS = 60_000;
/** `/api/health/worker` treats the worker as down when the monitor has not ticked for this long. */
export const MONITOR_STALE_MS = 3 * 60_000;
const CHECK_TIMEOUT_MS = 2_000;
/** Dead-lettered jobs newer than this count as "recent" (alert); older ones only show on the page. */
const RECENT_FAILED_SEC = 10 * 60;

export const BACKUP_HEARTBEATS = {
  dump: "backup:dump",
  restoreDrill: "backup:restore-drill",
  base: "backup:base",
  // Written by infra/host/moz-backup when a run fails (health.backup alerts while newer than the success).
  dumpFailed: "backup:dump-failed",
  restoreDrillFailed: "backup:restore-drill-failed",
  baseFailed: "backup:base-failed",
  // Measurements (job_heartbeats.value, 0017): bytes in B2 and the key's expiry (epoch seconds, 0 = none).
  storage: "backup:storage",
  keyExpiry: "backup:key-expiry",
} as const;

/**
 * The archive-off lever (P0-15 D2, RUNBOOK §6): a root-owned file on a read-only mount (`/etc/moz/<env>/backup-lever`
 * on the host). While it exists the Postgres wrapper skips WAL archiving, so health.backup alerts.
 */
export const ARCHIVE_OFF_FILE = "/run/moz/backup-lever/archive-off";

async function leverPresent(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

const SCOPE = systemScope("health monitor: job bookkeeping, outbox age and database size");

export const monitorKey = (): string => `${env().REDIS_KEY_PREFIX}health:monitor`;

type Timed<T> = { ok: true; ms: number; value: T } | { ok: false; ms: number };

async function timed<T>(run: () => Promise<T>, timeoutMs = CHECK_TIMEOUT_MS): Promise<Timed<T>> {
  const start = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, timeoutMs);
      }),
    ]);
    return { ok: true, ms: Math.round(performance.now() - start), value };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timer);
  }
}

const valueOr = <T, D>(t: Timed<T>, fallback: D): T | D => (t.ok ? t.value : fallback);

async function queueStats(now: Date): Promise<HealthSnapshot["queues"]> {
  return Promise.all(
    QUEUE_NAMES.map(async (name) => {
      const queue = getQueue(name);
      const [counts, oldest] = await Promise.all([
        queue.getJobCounts("wait", "active", "delayed", "failed", "prioritized"),
        queue.getJobs(["wait", "prioritized"], 0, 0, true),
      ]);
      const first = oldest[0];
      const readyAt = first ? first.timestamp + (first.opts.delay ?? 0) : now.getTime();
      return {
        name,
        waiting: (counts.wait ?? 0) + (counts.prioritized ?? 0),
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        lagSec: Math.max(0, Math.floor((now.getTime() - readyAt) / 1000)),
      };
    }),
  );
}

async function diskUsedPct(path: string): Promise<number | null> {
  const s = await statfs(path);
  const used = s.blocks - s.bfree;
  const total = used + s.bavail;
  return total > 0 ? (used / total) * 100 : null;
}

export type MonitorDeps = {
  redis?: () => Redis;
  cache?: () => Redis;
  alerter?: Alerter;
  now?: () => Date;
  /** Tests point this at a temporary file. */
  archiveOffFile?: string;
};

export async function collectHealth(deps: MonitorDeps = {}): Promise<HealthSnapshot> {
  const redis = deps.redis ?? limiterRedis;
  const cache = deps.cache ?? cacheRedis;
  const now = (deps.now ?? (() => new Date()))();
  const e = env();

  const [db, redisPing, cachePing] = await Promise.all([
    timed(() => databaseSizeBytes(SCOPE)),
    timed(() => redis().ping()),
    timed(() => cache().ping()),
  ]);
  const [beats, archiver, lever, failed, outbox, queues, usage, disk] = await Promise.all([
    db.ok ? timed(() => heartbeats(SCOPE)) : Promise.resolve({ ok: false as const, ms: 0 }),
    db.ok && e.BACKUPS_ENABLED
      ? timed(() => archiverStatus(SCOPE))
      : Promise.resolve({ ok: false as const, ms: 0 }),
    timed(() => leverPresent(deps.archiveOffFile ?? ARCHIVE_OFF_FILE)),
    db.ok
      ? timed(() => failedJobStats(SCOPE, RECENT_FAILED_SEC))
      : Promise.resolve({ ok: false as const, ms: 0 }),
    db.ok ? timed(() => staleOutbox(SCOPE, 0)) : Promise.resolve({ ok: false as const, ms: 0 }),
    redisPing.ok ? timed(() => queueStats(now)) : Promise.resolve({ ok: false as const, ms: 0 }),
    redisPing.ok
      ? timed(() => readUsage(now, redis()))
      : Promise.resolve({ ok: false as const, ms: 0 }),
    timed(() => diskUsedPct(e.DISK_PATH)),
  ]);
  const beat = (name: string): string | null =>
    valueOr(beats, null)?.get(name)?.lastRunAt.toISOString() ?? null;
  const measured = (name: string): number | null => valueOr(beats, null)?.get(name)?.value ?? null;
  const archiverValue = valueOr(archiver, null);
  const keyExpiry = measured(BACKUP_HEARTBEATS.keyExpiry);
  const outboxValue = valueOr(outbox, null);
  const failedValue = valueOr(failed, null);
  const usageValue = valueOr(usage, null);

  return {
    takenAt: now.toISOString(),
    db: { ok: db.ok, ms: db.ms, sizeBytes: valueOr(db, null) },
    redis: { ok: redisPing.ok, ms: redisPing.ms },
    cache: { ok: cachePing.ok, ms: cachePing.ms },
    scheduler: { lastRunAt: beat(HEARTBEAT_NAME), uptimeSec: Math.floor(process.uptime()) },
    queues: valueOr(queues, []),
    outbox: {
      pending: outboxValue?.count ?? null,
      oldestAgeSec: outboxValue?.oldestAgeSec ?? null,
    },
    failedJobs: {
      unresolved: failedValue?.unresolved ?? null,
      recent: failedValue?.recent ?? null,
    },
    disk: { path: e.DISK_PATH, usedPct: valueOr(disk, null) },
    backups: {
      enabled: e.BACKUPS_ENABLED,
      lastDumpAt: beat(BACKUP_HEARTBEATS.dump),
      lastWalAt: archiverValue?.lastArchivedAt?.toISOString() ?? null,
      lastWalFailedAt: archiverValue?.lastFailedAt?.toISOString() ?? null,
      lastRestoreDrillAt: beat(BACKUP_HEARTBEATS.restoreDrill),
      lastDumpFailedAt: beat(BACKUP_HEARTBEATS.dumpFailed),
      lastRestoreDrillFailedAt: beat(BACKUP_HEARTBEATS.restoreDrillFailed),
      lastBaseAt: beat(BACKUP_HEARTBEATS.base),
      lastBaseFailedAt: beat(BACKUP_HEARTBEATS.baseFailed),
      archiveOff: valueOr(lever, null),
      storageBytes: measured(BACKUP_HEARTBEATS.storage),
      storageBudgetBytes:
        e.APP_ENV === "production"
          ? BACKUP_STORAGE_BUDGET_BYTES.production
          : BACKUP_STORAGE_BUDGET_BYTES.staging,
      // 0 = the key never expires.
      keyExpiresAt: keyExpiry ? new Date(keyExpiry * 1000).toISOString() : null,
    },
    email: { sentToday: usageValue?.emailToday ?? null, cap: e.EMAIL_DAILY_CAP },
    sentry: { sentThisMonth: usageValue?.sentryMonth ?? null, quota: e.SENTRY_MONTHLY_QUOTA },
    sse: { connections: null },
  };
}

/** One monitor run. Never throws: a failing step is logged and the rest still runs. */
export async function healthTick(deps: MonitorDeps = {}): Promise<{
  snapshot: HealthSnapshot;
  raised: Array<{ kind: string; result: RaiseResult }>;
}> {
  const alerter = deps.alerter ?? sharedAlerter();
  const redis = deps.redis ?? limiterRedis;
  const snapshot = await collectHealth(deps);
  const alerts = evaluateHealth(snapshot, new Date(snapshot.takenAt));
  const raised: Array<{ kind: string; result: RaiseResult }> = [];
  for (const alert of alerts) {
    log().warn(
      { alert: alert.kind, category: "ops", ...alert.detail },
      `health alert: ${alert.kind}`,
    );
    raised.push({ kind: alert.kind, result: await alerter.raise(alert) });
  }
  await alerter.flush().catch((err: unknown) => {
    log().error({ err }, "alert flush failed");
  });
  if (snapshot.db.ok) {
    await writeOpsSnapshot(SCOPE, new Date(snapshot.takenAt), snapshot).catch((err: unknown) => {
      log().error({ err }, "health snapshot not stored");
    });
  }
  if (snapshot.redis.ok) {
    await redis()
      .set(monitorKey(), snapshot.takenAt, "PX", MONITOR_STALE_MS)
      .catch((err: unknown) => {
        log().warn({ err }, "health monitor liveness not stored");
      });
  }
  return { snapshot, raised };
}

/** Starts the minute timer (first run at once). Ticks never overlap; `stop` waits for a running one. */
export function startHealthMonitor(opts: { intervalMs?: number } & MonitorDeps = {}): {
  stop(): Promise<void>;
} {
  let running: Promise<unknown> | null = null;
  let stopped = false;
  const run = (): void => {
    if (running || stopped) return;
    running = healthTick(opts)
      .catch((err: unknown) => {
        log().error({ err }, "health tick failed");
      })
      .finally(() => {
        running = null;
      });
  };
  run();
  const timer = setInterval(run, opts.intervalMs ?? HEALTH_INTERVAL_MS);
  timer.unref();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await running;
    },
  };
}
