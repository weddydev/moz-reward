import { formatDateTime } from "@/lib/format-date";
import { evaluateHealth, type HealthSnapshot, THRESHOLDS } from "@/server/ops/health-rules";

/**
 * What the admin System page shows (P0-13, ARCHITECTURE §11), derived from the health monitor's latest snapshot.
 * Pure, so the wording and thresholds are unit-tested; the page only lays it out. Uses the monitor's own
 * thresholds (health-rules.ts), so the page and the alert emails always agree.
 */
export function ageText(sec: number | null): string {
  if (sec === null) return "never";
  if (sec < 120) return `${String(sec)} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${String(min)} min`;
  const hours = Math.floor(min / 60);
  if (hours < 48)
    return min % 60 === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(min % 60)} min`;
  return `${String(Math.floor(hours / 24))} days`;
}

export function bytesText(bytes: number | null): string {
  if (bytes === null) return "unknown";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${String(Math.round(bytes / 1024 ** 2))} MB`;
}

const NUM = new Intl.NumberFormat("en-GB");

export function quotaView(
  used: number | null,
  cap: number,
): { text: string; pct: number | null; warn: boolean } {
  if (used === null) return { text: "Not counted yet", pct: null, warn: false };
  const pct = Math.round((used / cap) * 100);
  return {
    text: `${NUM.format(used)} of ${NUM.format(cap)} (${String(pct)}%)`,
    pct,
    warn: pct >= THRESHOLDS.quotaPct,
  };
}

const ageOf = (iso: string | null, now: Date): number | null =>
  iso === null ? null : Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000));

export type SystemView = {
  takenAt: string;
  takenAgo: string;
  stale: boolean;
  status: Array<{ label: string; ok: boolean; detail: string }>;
  queues: Array<HealthSnapshot["queues"][number] & { lag: string; lagging: boolean }>;
  outbox: { pending: number | null; oldest: string; late: boolean };
  failedJobs: HealthSnapshot["failedJobs"];
  backups: { enabled: boolean; rows: Array<{ label: string; value: string }> };
  disk: { path: string; text: string; warn: boolean };
  dbSize: string;
  email: ReturnType<typeof quotaView>;
  sentry: ReturnType<typeof quotaView>;
  sse: string;
  alerts: string[];
};

export function systemView(s: HealthSnapshot, now: Date): SystemView {
  const takenAge = ageOf(s.takenAt, now) ?? 0;
  const schedulerAge = ageOf(s.scheduler.lastRunAt, now);
  return {
    takenAt: formatDateTime(new Date(s.takenAt)),
    takenAgo: ageText(takenAge),
    stale: takenAge * 1000 > 3 * 60_000,
    status: [
      {
        label: "Database",
        ok: s.db.ok,
        detail: s.db.ok ? `${String(s.db.ms)} ms` : "not answering",
      },
      {
        label: "Redis (queue)",
        ok: s.redis.ok,
        detail: s.redis.ok ? `${String(s.redis.ms)} ms` : "not answering",
      },
      {
        label: "Redis (cache)",
        ok: s.cache.ok,
        detail: s.cache.ok
          ? `${String(s.cache.ms)} ms`
          : "not answering (the app runs without it, slower)",
      },
      {
        label: "Scheduler",
        ok: schedulerAge !== null && schedulerAge <= THRESHOLDS.schedulerStaleSec,
        detail: `last heartbeat ${ageText(schedulerAge)}${schedulerAge === null ? "" : " ago"}`,
      },
    ],
    queues: s.queues.map((q) => ({
      ...q,
      lag: ageText(q.lagSec),
      lagging: q.lagSec > THRESHOLDS.queueLagSec,
    })),
    outbox: {
      pending: s.outbox.pending,
      oldest: s.outbox.oldestAgeSec === null ? "unknown" : ageText(s.outbox.oldestAgeSec),
      late: (s.outbox.oldestAgeSec ?? 0) > THRESHOLDS.outboxAgeSec,
    },
    failedJobs: s.failedJobs,
    backups: s.backups.enabled
      ? {
          enabled: true,
          rows: [
            { label: "Last nightly dump", value: ageText(ageOf(s.backups.lastDumpAt, now)) },
            { label: "Last WAL archive", value: ageText(ageOf(s.backups.lastWalAt, now)) },
            { label: "Last base backup", value: ageText(ageOf(s.backups.lastBaseAt, now)) },
            ...(s.backups.archiveOff === true
              ? [{ label: "WAL archiving", value: "off (archive-off lever)" }]
              : []),
            {
              label: "Backup storage",
              value:
                s.backups.storageBytes === null
                  ? "unknown"
                  : `${(s.backups.storageBytes / 1e9).toFixed(2)} of ${(s.backups.storageBudgetBytes / 1e9).toFixed(0)} GB`,
            },
            {
              label: "Last restore drill",
              value: ageText(ageOf(s.backups.lastRestoreDrillAt, now)),
            },
          ],
        }
      : { enabled: false, rows: [] },
    disk: {
      path: s.disk.path,
      text: s.disk.usedPct === null ? "unknown" : `${String(Math.round(s.disk.usedPct))}% used`,
      warn: (s.disk.usedPct ?? 0) >= THRESHOLDS.diskPct,
    },
    dbSize: bytesText(s.db.sizeBytes),
    email: quotaView(s.email.sentToday, s.email.cap),
    sentry: quotaView(s.sentry.sentThisMonth, s.sentry.quota),
    sse:
      s.sse.connections === null
        ? "Not counted yet (comes with live updates)"
        : String(s.sse.connections),
    alerts: evaluateHealth(s, new Date(s.takenAt)).map((a) => a.kind),
  };
}
