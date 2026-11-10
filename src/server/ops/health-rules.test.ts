import { describe, expect, it } from "vitest";
import { evaluateHealth, type HealthSnapshot, THRESHOLDS } from "./health-rules";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (sec: number): string => new Date(NOW.getTime() - sec * 1000).toISOString();

function healthy(): HealthSnapshot {
  return {
    takenAt: NOW.toISOString(),
    db: { ok: true, ms: 3, sizeBytes: 50_000_000 },
    redis: { ok: true, ms: 1 },
    cache: { ok: true, ms: 1 },
    scheduler: { lastRunAt: ago(30) },
    queues: [{ name: "email", waiting: 0, active: 0, delayed: 0, failed: 0, lagSec: 0 }],
    outbox: { pending: 0, oldestAgeSec: 0 },
    failedJobs: { unresolved: 0, recent: 0 },
    disk: { path: "/", usedPct: 41 },
    backups: { enabled: false, lastDumpAt: null, lastWalAt: null, lastRestoreDrillAt: null },
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
    s.scheduler = { lastRunAt: ago(181) };
    expect(kinds(s)).toEqual(["health.scheduler"]);
    s.scheduler = { lastRunAt: null };
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

  it("backups are checked only once enabled (P0-15): dump > 26 h, WAL > 10 min, drill > 35 days, or missing", () => {
    const s = healthy();
    expect(kinds(s)).toEqual([]); // not enabled yet: nothing to check
    s.backups = {
      enabled: true,
      lastDumpAt: ago(25 * 3600),
      lastWalAt: ago(9 * 60),
      lastRestoreDrillAt: ago(30 * 86400),
    };
    expect(kinds(s)).toEqual([]);
    s.backups = {
      enabled: true,
      lastDumpAt: ago(27 * 3600),
      lastWalAt: null,
      lastRestoreDrillAt: ago(36 * 86400),
    };
    const alert = evaluateHealth(s, NOW).find((a) => a.kind === "health.backup");
    expect(alert?.detail).toEqual({ dumpAgeHours: 27, walAgeMin: null, drillAgeDays: 36 });
  });

  it("unknown values (a check that could not run) never raise a false alarm by themselves", () => {
    const s = healthy();
    s.disk = { path: "/", usedPct: null };
    s.queues = [];
    s.outbox = { pending: null, oldestAgeSec: null };
    expect(kinds(s)).toEqual([]);
  });
});
