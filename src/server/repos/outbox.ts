import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { newId } from "@/lib/id";
import type { Scope, SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { outbox } from "@/server/db/schema";
import { poolFor, withScope } from "./_base";

/**
 * Outbox rows (P0-18, ARCHITECTURE §6). Writers append inside the caller's transaction; everything else is the
 * relay, the worker and the sweeper, under a system scope.
 */
export type OutboxRow = {
  id: string;
  queue: string;
  jobName: string;
  payload: unknown;
  attempts: number;
};

/** How long a claimed row stays invisible to other relays before it can be claimed again. */
export const CLAIM_LEASE_SEC = 30;

/** The originating scope stored with a row (C-30). RLS checks it against the writer's own settings. */
export type OutboxScope = {
  scopeKind: "customer" | "shop" | "admin" | "auth" | "system";
  scopeUserId: string | null;
  scopeShopId: string | null;
  scopeRole: string | null;
};

export function outboxScope(scope: Scope): OutboxScope {
  switch (scope.kind) {
    case "customer":
      return {
        scopeKind: "customer",
        scopeUserId: scope.userId,
        scopeShopId: null,
        scopeRole: null,
      };
    case "shop":
      return {
        scopeKind: "shop",
        scopeUserId: scope.userId,
        scopeShopId: scope.shopId,
        scopeRole: scope.role,
      };
    case "admin":
      return {
        scopeKind: "admin",
        scopeUserId: scope.userId,
        scopeShopId: null,
        scopeRole: scope.role,
      };
    case "auth":
    case "system":
      return { scopeKind: scope.kind, scopeUserId: null, scopeShopId: null, scopeRole: null };
    case "public":
      throw new Error("a public scope cannot write to the outbox");
  }
}

/**
 * Appends one row in the caller's transaction (the side effect commits or rolls back with the change). The id
 * is generated here: the web role may only INSERT (C-29), so there is no RETURNING.
 */
export async function insertOutbox(
  scope: Scope,
  tx: Transaction,
  row: { queue: string; jobName: string; payload: unknown },
): Promise<string> {
  const id = newId();
  await withScope(scope, (q) => q.insert(outbox).values({ id, ...outboxScope(scope), ...row }), tx);
  return id;
}

/**
 * Claims up to `limit` due, undispatched rows (oldest first) and leases them for `leaseSec`, in one
 * statement. `SKIP LOCKED` lets several relays run side by side without waiting on or double-claiming a row.
 */
export async function claimOutbox(
  scope: SystemScope,
  limit: number,
  leaseSec: number = CLAIM_LEASE_SEC,
): Promise<OutboxRow[]> {
  const rows = await poolFor(scope).execute<{
    id: string;
    queue: string;
    job_name: string;
    payload: unknown;
    attempts: number;
  }>(sql`
    WITH claimed AS MATERIALIZED (
      SELECT ${outbox.id} AS id FROM ${outbox}
      WHERE ${outbox.dispatchedAt} IS NULL AND ${outbox.nextAttemptAt} <= now()
      ORDER BY ${outbox.createdAt}, ${outbox.id}
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${outbox} SET
      next_attempt_at = now() + make_interval(secs => ${leaseSec}),
      attempts = ${outbox.attempts} + 1
    FROM claimed WHERE ${outbox.id} = claimed.id
    RETURNING "outbox".id, queue, job_name, payload, attempts`);
  return rows
    .map((r) => ({
      id: r.id,
      queue: r.queue,
      jobName: r.job_name,
      payload: r.payload,
      attempts: r.attempts,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The job is in redis-queue. `coalesce`: a fast worker may already have completed (and so dispatched) it. */
export async function markDispatched(scope: SystemScope, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await poolFor(scope)
    .update(outbox)
    .set({ dispatchedAt: sql`coalesce(${outbox.dispatchedAt}, now())`, lastError: null })
    .where(inArray(outbox.id, [...ids]));
}

/** The enqueue failed: try again after `retryInSec` (exponential backoff, computed by the relay). */
export async function markDispatchFailed(
  scope: SystemScope,
  id: string,
  error: string,
  retryInSec: number,
): Promise<void> {
  await poolFor(scope)
    .update(outbox)
    .set({
      lastError: error.slice(0, 500),
      nextAttemptAt: sql`now() + make_interval(secs => ${retryInSec})`,
    })
    .where(and(eq(outbox.id, id), isNull(outbox.dispatchedAt)));
}

/**
 * What the worker needs about a row before running its job: whether the side effect already happened (a
 * replayed job is skipped) and the scope that wrote it (tenant jobs run under it, C-30). Null: no such row.
 */
export async function outboxJobFacts(
  scope: SystemScope,
  id: string,
): Promise<({ completed: boolean } & OutboxScope) | null> {
  const [row] = await poolFor(scope)
    .select({
      completedAt: outbox.completedAt,
      scopeKind: outbox.scopeKind,
      scopeUserId: outbox.scopeUserId,
      scopeShopId: outbox.scopeShopId,
      scopeRole: outbox.scopeRole,
    })
    .from(outbox)
    .where(eq(outbox.id, id))
    .limit(1);
  if (!row) return null;
  const { completedAt, scopeKind, ...rest } = row;
  return {
    completed: completedAt != null,
    scopeKind: scopeKind as OutboxScope["scopeKind"],
    ...rest,
  };
}

export async function markOutboxCompleted(scope: SystemScope, id: string): Promise<void> {
  await poolFor(scope)
    .update(outbox)
    .set({
      completedAt: sql`coalesce(${outbox.completedAt}, now())`,
      dispatchedAt: sql`coalesce(${outbox.dispatchedAt}, now())`,
    })
    .where(eq(outbox.id, id));
}

/** The job exhausted its retries (dead-lettered in failed_jobs): the row leaves replay and the sweeps. */
export async function markOutboxFailed(scope: SystemScope, id: string): Promise<void> {
  await poolFor(scope)
    .update(outbox)
    .set({
      failedAt: sql`coalesce(${outbox.failedAt}, now())`,
      dispatchedAt: sql`coalesce(${outbox.dispatchedAt}, now())`,
    })
    .where(and(eq(outbox.id, id), isNull(outbox.completedAt)));
}

/**
 * Rows dispatched more than `olderThanSec` ago that never completed nor failed: their job is gone from
 * redis-queue (AOF loss, flush, lost host) or no worker knows its queue. Oldest first, at most `limit`.
 */
export async function lostOutbox(
  scope: SystemScope,
  olderThanSec: number,
  limit: number,
): Promise<OutboxRow[]> {
  return poolFor(scope)
    .select({
      id: outbox.id,
      queue: outbox.queue,
      jobName: outbox.jobName,
      payload: outbox.payload,
      attempts: outbox.attempts,
    })
    .from(outbox)
    .where(
      and(
        isNotNull(outbox.dispatchedAt),
        isNull(outbox.completedAt),
        isNull(outbox.failedAt),
        lt(outbox.dispatchedAt, sql`now() - make_interval(secs => ${olderThanSec})`),
      ),
    )
    .orderBy(asc(outbox.dispatchedAt), asc(outbox.id))
    .limit(limit);
}

/** Undispatched rows created more than `olderThanSec` ago (reconciliation, AC6). */
export async function staleOutbox(
  scope: SystemScope,
  olderThanSec: number,
): Promise<{
  count: number;
  oldestAgeSec: number;
  sample: { id: string; queue: string; jobName: string }[];
}> {
  const cutoff = sql`now() - make_interval(secs => ${olderThanSec})`;
  const where = and(isNull(outbox.dispatchedAt), lt(outbox.createdAt, cutoff));
  const [summary] = await poolFor(scope)
    .select({
      count: sql<number>`count(*)::int`,
      oldestAgeSec: sql<number>`coalesce(extract(epoch from now() - min(${outbox.createdAt})), 0)::int`,
    })
    .from(outbox)
    .where(where);
  const sample = await poolFor(scope)
    .select({ id: outbox.id, queue: outbox.queue, jobName: outbox.jobName })
    .from(outbox)
    .where(where)
    .orderBy(asc(outbox.createdAt), asc(outbox.id))
    .limit(10);
  return { count: summary?.count ?? 0, oldestAgeSec: summary?.oldestAgeSec ?? 0, sample };
}

/** Keyset cursor for replay: the exact timestamptz as text (a JS Date would drop the microseconds). */
export type ReplayCursor = { dispatchedAt: string; id: string };

/**
 * Rows dispatched at or after `since` whose side effect is not recorded as done (nor dead-lettered), keyset-paged by
 * (dispatched_at, id) (replay after a restore, AC7).
 */
export async function replayCandidates(
  scope: SystemScope,
  since: Date,
  after: ReplayCursor | null,
  limit: number,
): Promise<(OutboxRow & { cursor: ReplayCursor })[]> {
  const rows = await poolFor(scope)
    .select({
      id: outbox.id,
      queue: outbox.queue,
      jobName: outbox.jobName,
      payload: outbox.payload,
      attempts: outbox.attempts,
      dispatchedAt: sql<string>`${outbox.dispatchedAt}::text`,
    })
    .from(outbox)
    .where(
      and(
        isNotNull(outbox.dispatchedAt),
        isNull(outbox.completedAt),
        isNull(outbox.failedAt),
        gte(outbox.dispatchedAt, since),
        after
          ? sql`(${outbox.dispatchedAt}, ${outbox.id}) > (${after.dispatchedAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(asc(outbox.dispatchedAt), asc(outbox.id))
    .limit(limit);
  return rows.map(({ dispatchedAt, ...r }) => ({ ...r, cursor: { dispatchedAt, id: r.id } }));
}

/** Deletes up to `limit` rows finished (completed or dead-lettered) more than `olderThanDays` ago. */
export async function pruneFinishedOutbox(
  scope: SystemScope,
  olderThanDays: number,
  limit: number,
): Promise<number> {
  const rows = await poolFor(scope).execute<{ id: string }>(sql`
    DELETE FROM ${outbox} WHERE ${outbox.id} IN (
      SELECT ${outbox.id} FROM ${outbox}
      WHERE (${outbox.completedAt} IS NOT NULL OR ${outbox.failedAt} IS NOT NULL)
        AND coalesce(${outbox.completedAt}, ${outbox.failedAt}) < now() - make_interval(days => ${olderThanDays})
      ORDER BY coalesce(${outbox.completedAt}, ${outbox.failedAt})
      LIMIT ${limit}
    ) RETURNING id`);
  return rows.length;
}
