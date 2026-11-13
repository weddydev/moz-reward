import { describe, expect, it } from "vitest";
import type { HealthSnapshot } from "@/server/ops/health-rules";
import { healthSnapshotSchema } from "@/server/ops/health-rules";
import { ageText, bytesText, quotaView, systemView } from "./view-model";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (sec: number): string => new Date(NOW.getTime() - sec * 1000).toISOString();

const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  takenAt: ago(35),
  db: { ok: true, ms: 3, sizeBytes: 52_428_800 },
  redis: { ok: true, ms: 1 },
  cache: { ok: false, ms: 250 },
  scheduler: { lastRunAt: ago(20), uptimeSec: 3600 },
  queues: [{ name: "email", waiting: 2, active: 1, delayed: 0, failed: 0, lagSec: 75 }],
  outbox: { pending: 0, oldestAgeSec: 0 },
  failedJobs: { unresolved: 1, recent: 0 },
  disk: { path: "/", usedPct: 41.4 },
  backups: {
    enabled: false,
    lastDumpAt: null,
    lastWalAt: null,
    lastRestoreDrillAt: null,
    lastDumpFailedAt: null,
    lastRestoreDrillFailedAt: null,
  },
  email: { sentToday: 290, cap: 400 },
  sentry: { sentThisMonth: null, quota: 5000 },
  sse: { connections: null },
  ...over,
});

describe("[P0-13] System page view model", () => {
  it("ages and sizes read plainly", () => {
    expect(ageText(35)).toBe("35 s");
    expect(ageText(240)).toBe("4 min");
    expect(ageText(3 * 3600 + 300)).toBe("3 h 5 min");
    expect(ageText(2 * 86400 + 10)).toBe("2 days");
    expect(ageText(null)).toBe("never");
    expect(bytesText(52_428_800)).toBe("50 MB");
    expect(bytesText(3 * 1024 ** 3)).toBe("3.0 GB");
    expect(bytesText(null)).toBe("unknown");
  });

  it("quotas: used of cap with a percentage; 70% or more is a warning; unknown is said so", () => {
    expect(quotaView(290, 400)).toEqual({ text: "290 of 400 (73%)", pct: 73, warn: true });
    expect(quotaView(10, 400)).toEqual({ text: "10 of 400 (3%)", pct: 3, warn: false });
    expect(quotaView(3500, 5000)).toEqual({ text: "3,500 of 5,000 (70%)", pct: 70, warn: true });
    expect(quotaView(null, 5000)).toEqual({ text: "Not counted yet", pct: null, warn: false });
  });

  it("status rows, lagging queues and a fresh snapshot", () => {
    const v = systemView(snapshot(), NOW);
    expect(v.stale).toBe(false);
    expect(v.takenAgo).toBe("35 s");
    expect(v.status.map((s) => [s.label, s.ok])).toEqual([
      ["Database", true],
      ["Redis (queue)", true],
      ["Redis (cache)", false],
      ["Scheduler", true],
    ]);
    expect(v.queues[0]).toMatchObject({ name: "email", lag: "75 s", lagging: true });
    expect(v.backups).toEqual({ enabled: false, rows: [] });
    expect(v.alerts).toEqual(["health.queue_lag", "quota.email"]);
  });

  it("stored snapshots are validated before rendering", () => {
    expect(healthSnapshotSchema.safeParse(snapshot()).success).toBe(true);
    expect(healthSnapshotSchema.safeParse({ takenAt: "x" }).success).toBe(false);
  });

  it("a snapshot older than 3 minutes is stale (the worker may be down)", () => {
    expect(systemView(snapshot({ takenAt: ago(200) }), NOW).stale).toBe(true);
  });
});
