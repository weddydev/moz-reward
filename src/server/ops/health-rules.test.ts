import { describe, expect, it } from "vitest";
import {
  evaluateHealth,
  type HealthSnapshot,
  healthSnapshotSchema,
  THRESHOLDS,
} from "./health-rules";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (sec: number): string => new Date(NOW.getTime() - sec * 1000).toISOString();

function healthy(): HealthSnapshot {
  return {
    takenAt: NOW.toISOString(),
    db: { ok: true, ms: 3, sizeBytes: 50_000_000 },
    redis: { ok: true, ms: 1 },
    cache: { ok: true, ms: 1 },
    scheduler: { lastRunAt: ago(30), uptimeSec: 3600 },
    queues: [{ name: "email", waiting: 0, active: 0, delayed: 0, failed: 0, lagSec: 0 }],
    outbox: { pending: 0, oldestAgeSec: 0 },
    failedJobs: { unresolved: 0, recent: 0 },
    disk: { path: "/", usedPct: 41 },
    backups: {
      enabled: false,
      lastDumpAt: null,
      lastWalAt: null,
      lastWalFailedAt: null,
      lastRestoreDrillAt: null,
      lastDumpFailedAt: null,
      lastRestoreDrillFailedAt: null,
      lastBaseAt: null,
      lastBaseFailedAt: null,
      archiveOff: null,
      storageBytes: null,
      storageBudgetBytes: 2_000_000_000,
      keyExpiresAt: null,
    },
    email: { sentToday: 10, cap: 400 },
    sentry: { sentThisMonth: 100, quota: 5000 },
    sse: { connections: null },
  };
}

const kinds = (s: HealthSnapshot): string[] => evaluateHealth(s, NOW).map((a) => a.kind);

describe("[P0-13] health thresholds (ARCHITECTURE §11)", () => {
  it("a healthy system raises nothing", () => {
    expect(kinds(healthy())).toEqual([]);
  });

  it("database or Redis down", () => {
    const s = healthy();
    s.db = { ok: false, ms: 1500, sizeBytes: null };
    s.redis = { ok: false, ms: 750 };
    expect(kinds(s)).toEqual(["health.db", "health.redis"]);
  });

  it("queue lag above 60 s names the queue; exactly 60 s does not alert", () => {
    const s = healthy();
    s.queues = [
      {
        name: "email",
        waiting: 3,
        active: 0,
        delayed: 0,
        failed: 0,
        lagSec: THRESHOLDS.queueLagSec,
      },
      { name: "notifications", waiting: 9, active: 1, delayed: 0, failed: 0, lagSec: 61 },
    ];
    const alerts = evaluateHealth(s, NOW);
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: "health.queue_lag",
        detail: { queue: "notifications", lagSec: 61, waiting: 9 },
      }),
    ]);
  });

  it("outbox rows waiting more than 2 min raise outbox.stale (same kind as the sweep: deduplicated together)", () => {
    const s = healthy();
    s.outbox = { pending: 4, oldestAgeSec: 121 };
    expect(kinds(s)).toEqual(["outbox.stale"]);
    s.outbox = { pending: 4, oldestAgeSec: 120 };
    expect(kinds(s)).toEqual([]);
  });

  it("the scheduler is stale after 3 min without a heartbeat, or never ran", () => {
    const s = healthy();
    s.scheduler = { lastRunAt: ago(181), uptimeSec: 3600 };
    expect(kinds(s)).toEqual(["health.scheduler"]);
    s.scheduler = { lastRunAt: null, uptimeSec: 3600 };
    expect(kinds(s)).toEqual(["health.scheduler"]);
  });

  it("a worker that just started gets 3 min before a missing heartbeat alerts (no false alarm on every deploy)", () => {
    const s = healthy();
    s.scheduler = { lastRunAt: null, uptimeSec: 5 };
    expect(kinds(s)).toEqual([]);
    s.scheduler = { lastRunAt: null, uptimeSec: 181 };
    expect(kinds(s)).toEqual(["health.scheduler"]);
  });

  it("new dead-lettered jobs alert; old unresolved ones alone do not", () => {
    const s = healthy();
    s.failedJobs = { unresolved: 7, recent: 0 };
    expect(kinds(s)).toEqual([]);
    s.failedJobs = { unresolved: 8, recent: 1 };
    expect(kinds(s)).toEqual(["health.failed_jobs"]);
  });

  it("disk at 80% or more", () => {
    const s = healthy();
    s.disk = { path: "/", usedPct: 79.9 };
    expect(kinds(s)).toEqual([]);
    s.disk = { path: "/", usedPct: 80 };
    expect(kinds(s)).toEqual(["health.disk"]);
  });

  it("free-tier quotas at 70% (email per day, Sentry per month)", () => {
    const s = healthy();
    s.email = { sentToday: 279, cap: 400 };
    s.sentry = { sentThisMonth: 3499, quota: 5000 };
    expect(kinds(s)).toEqual([]);
    s.email = { sentToday: 280, cap: 400 };
    s.sentry = { sentThisMonth: 3500, quota: 5000 };
    expect(kinds(s)).toEqual(["quota.email", "quota.sentry"]);
  });

  /** Every backup check fresh and passing (enabled). */
  const okBackups = (): HealthSnapshot["backups"] => ({
    enabled: true,
    lastDumpAt: ago(3600),
    lastWalAt: ago(60),
    lastWalFailedAt: null,
    lastRestoreDrillAt: ago(86400),
    lastDumpFailedAt: null,
    lastRestoreDrillFailedAt: null,
    lastBaseAt: ago(2 * 86400),
    lastBaseFailedAt: null,
    archiveOff: false,
    storageBytes: 500_000_000,
    storageBudgetBytes: 2_000_000_000,
    keyExpiresAt: null,
  });
  const backupAlert = (
    b: Partial<HealthSnapshot["backups"]>,
  ): Record<string, unknown> | undefined => {
    const s = healthy();
    s.backups = { ...okBackups(), ...b };
    return evaluateHealth(s, NOW).find((a) => a.kind === "health.backup")?.detail;
  };

  it("backups are checked only once enabled (P0-15): dump > 26 h, WAL > 10 min, drill > 35 days, or missing", () => {
    const s = healthy();
    expect(kinds(s)).toEqual([]); // not enabled yet: nothing to check
    expect(
      backupAlert({
        lastDumpAt: ago(25 * 3600),
        lastWalAt: ago(9 * 60),
        lastRestoreDrillAt: ago(30 * 86400),
        lastBaseAt: ago(7 * 86400),
      }),
    ).toBeUndefined();
    expect(
      backupAlert({
        lastDumpAt: ago(27 * 3600),
        lastWalAt: null,
        lastRestoreDrillAt: ago(36 * 86400),
      }),
    ).toEqual({
      dumpAgeHours: 27,
      walAgeMin: null,
      baseAgeDays: 2,
      drillAgeDays: 36,
      dumpFailed: false,
      drillFailed: false,
      walFailing: false,
      baseFailed: false,
      archiveOff: false,
      storagePct: 25,
      keyExpiresInDays: null,
    });
  });

  it("[P0-15] a failed dump or drill newer than the last success alerts at once, whatever the ages", () => {
    // A failure older than the success it was followed by is history, not an alert.
    expect(
      backupAlert({ lastDumpFailedAt: ago(2 * 86400), lastRestoreDrillFailedAt: ago(3 * 86400) }),
    ).toBeUndefined();
    expect(backupAlert({ lastDumpFailedAt: ago(60) })).toMatchObject({
      dumpFailed: true,
      drillFailed: false,
    });
    // A drill that has never passed but has failed: the failure alerts (not only the 35-day age).
    expect(
      backupAlert({ lastRestoreDrillAt: null, lastRestoreDrillFailedAt: ago(60) }),
    ).toMatchObject({ dumpFailed: false, drillFailed: true });

    // Not enabled (staging before D4): failures are not alerted either.
    const s = healthy();
    s.backups = { ...okBackups(), lastDumpFailedAt: ago(60), enabled: false };
    expect(kinds(s)).toEqual([]);
  });

  it("[P0-15] WAL: pg_stat_archiver failing (last failure newer than last success) alerts even when the last archive is recent", () => {
    expect(backupAlert({ lastWalFailedAt: ago(120), lastWalAt: ago(180) })).toMatchObject({
      walFailing: true,
      walAgeMin: 3,
    });
    // An old failure followed by successes is not an alert.
    expect(backupAlert({ lastWalFailedAt: ago(3600), lastWalAt: ago(30) })).toBeUndefined();
    // Never archived (archive_mode off or archiving never succeeded) = failing.
    expect(backupAlert({ lastWalAt: null })).toMatchObject({ walAgeMin: null });
    expect(backupAlert({ lastWalAt: ago(11 * 60) })).toMatchObject({ walAgeMin: 11 });
  });

  it("[P0-15] the archive-off lever alerts for as long as it exists; unknown lever state alone does not", () => {
    expect(backupAlert({ archiveOff: true })).toMatchObject({ archiveOff: true });
    expect(backupAlert({ archiveOff: null })).toBeUndefined();
  });

  it("[P0-15] base backup: older than 8 days, missing, or failed since the last success alerts", () => {
    expect(backupAlert({ lastBaseAt: ago(8 * 86400 - 60) })).toBeUndefined();
    expect(backupAlert({ lastBaseAt: ago(8 * 86400 + 60) })).toMatchObject({ baseAgeDays: 8 });
    expect(backupAlert({ lastBaseAt: null })).toMatchObject({ baseAgeDays: null });
    expect(backupAlert({ lastBaseFailedAt: ago(60) })).toMatchObject({ baseFailed: true });
    expect(backupAlert({ lastBaseFailedAt: ago(3 * 86400) })).toBeUndefined();
  });

  it("[P0-15] storage alerts at 70% of the environment's B2 budget; unknown storage does not", () => {
    expect(backupAlert({ storageBytes: 1_399_999_999 })).toBeUndefined();
    expect(backupAlert({ storageBytes: 1_400_000_000 })).toMatchObject({ storagePct: 70 });
    expect(backupAlert({ storageBytes: null })).toBeUndefined();
    // A missing budget (snapshot stored before D2) never divides by zero into an alert.
    expect(backupAlert({ storageBytes: 1_400_000_000, storageBudgetBytes: 0 })).toBeUndefined();
  });

  it("[P0-15] the backup key alerts 30 days before it expires (and once expired); no expiry = no alert", () => {
    const inDays = (d: number): string => new Date(NOW.getTime() + d * 86400_000).toISOString();
    expect(backupAlert({ keyExpiresAt: inDays(31) })).toBeUndefined();
    expect(backupAlert({ keyExpiresAt: inDays(29) })).toMatchObject({ keyExpiresInDays: 29 });
    expect(backupAlert({ keyExpiresAt: inDays(-1) })).toMatchObject({ keyExpiresInDays: -1 });
    expect(backupAlert({ keyExpiresAt: null })).toBeUndefined();
  });

  it("[P0-15] a snapshot stored before the D1/D2 fields existed still parses (new fields read as none)", () => {
    const old = JSON.parse(JSON.stringify(healthy())) as Record<string, unknown>;
    old.backups = { enabled: true, lastDumpAt: null, lastWalAt: null, lastRestoreDrillAt: null };
    const parsed = healthSnapshotSchema.parse(old);
    expect(parsed.backups).toMatchObject({
      lastDumpFailedAt: null,
      lastRestoreDrillFailedAt: null,
      lastWalFailedAt: null,
      lastBaseAt: null,
      lastBaseFailedAt: null,
      archiveOff: null,
      storageBytes: null,
      storageBudgetBytes: 0,
      keyExpiresAt: null,
    });
  });

  it("unknown values (a check that could not run) never raise a false alarm by themselves", () => {
    const s = healthy();
    s.disk = { path: "/", usedPct: null };
    s.queues = [];
    s.outbox = { pending: null, oldestAgeSec: null };
    expect(kinds(s)).toEqual([]);
  });
});
