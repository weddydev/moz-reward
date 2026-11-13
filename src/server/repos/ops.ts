import "server-only";
import { and, gt, isNull, sql } from "drizzle-orm";
import type { AdminScope, SystemScope } from "@/server/authz/scope";
import { failedJobs, jobHeartbeats, opsSnapshot } from "@/server/db/schema";
import { poolFor, withScope } from "./_base";

/**
 * Health monitor data (P0-13). The worker (system scope) reads job bookkeeping and writes the one snapshot
 * row; the admin System page reads that row as an admin owner (RLS: ops_snapshot_admin_owner).
 */
export async function writeOpsSnapshot(
  scope: SystemScope,
  takenAt: Date,
  data: unknown,
): Promise<void> {
  await poolFor(scope)
    .insert(opsSnapshot)
    .values({ id: 1, takenAt, data })
    .onConflictDoUpdate({ target: opsSnapshot.id, set: { takenAt, data } });
}

/**
 * The latest snapshot, or null (none yet, or the caller is not the admin owner: RLS shows no row).
 * admin-scope: the one global health row (no shop data), readable by the admin owner only.
 */
export async function readOpsSnapshot(
  scope: AdminScope,
): Promise<{ takenAt: Date; data: unknown } | null> {
  const [row] = await withScope(scope, (q) =>
    q.select({ takenAt: opsSnapshot.takenAt, data: opsSnapshot.data }).from(opsSnapshot).limit(1),
  );
  return row ?? null;
}

export type Heartbeat = { lastRunAt: Date; value: number | null };

/**
 * Last run per heartbeat name (`scheduled:heartbeat`, and from P0-15 the backup jobs), with the measurement
 * some of them carry (`backup:storage`, `backup:key-expiry`; 0017).
 */
export async function heartbeats(scope: SystemScope): Promise<Map<string, Heartbeat>> {
  const rows = await poolFor(scope)
    .select({
      name: jobHeartbeats.name,
      lastRunAt: jobHeartbeats.lastRunAt,
      value: jobHeartbeats.value,
    })
    .from(jobHeartbeats);
  return new Map(rows.map((r) => [r.name, { lastRunAt: r.lastRunAt, value: r.value }]));
}

/**
 * WAL archiving as Postgres reports it (P0-15 D2): the last segment archive_command archived and the last one it
 * failed. Both null when archiving has never run (dev, CI, or archive_mode off).
 */
export async function archiverStatus(
  scope: SystemScope,
): Promise<{ lastArchivedAt: Date | null; lastFailedAt: Date | null }> {
  const rows = await poolFor(scope).execute<{
    archived: string | null;
    failed: string | null;
  }>(
    sql`SELECT last_archived_time::text AS archived, last_failed_time::text AS failed FROM pg_stat_archiver`,
  );
  const row = [...rows][0];
  const at = (v: string | null | undefined): Date | null => (v ? new Date(v) : null);
  return { lastArchivedAt: at(row?.archived), lastFailedAt: at(row?.failed) };
}

/** Unresolved dead-lettered jobs, and how many of them failed in the last `recentSec` seconds. */
export async function failedJobStats(
  scope: SystemScope,
  recentSec: number,
): Promise<{ unresolved: number; recent: number }> {
  const [row] = await poolFor(scope)
    .select({
      unresolved: sql<number>`count(*)::int`,
      recent: sql<number>`count(*) FILTER (WHERE ${failedJobs.failedAt} > now() - make_interval(secs => ${recentSec}))::int`,
    })
    .from(failedJobs)
    .where(and(isNull(failedJobs.resolvedAt), gt(failedJobs.attempts, 0)));
  return { unresolved: row?.unresolved ?? 0, recent: row?.recent ?? 0 };
}

export async function databaseSizeBytes(scope: SystemScope): Promise<number> {
  const rows = await poolFor(scope).execute<{ bytes: string }>(
    sql`SELECT pg_database_size(current_database())::text AS bytes`,
  );
  return Number([...rows][0]?.bytes ?? 0);
}
