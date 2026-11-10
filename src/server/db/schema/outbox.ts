/**
 * Transactional outbox (P0-18, ARCHITECTURE §6, ENGINEERING §4 step 7). A side effect (email, push, PDF,
 * SSE publish…) is written here in the same transaction as the change that causes it; the relay in the worker
 * turns each row into a BullMQ job with `jobId = outbox.id` after commit. Nothing is sent from inside a
 * transaction, and nothing is lost if the process dies between commit and enqueue.
 *
 * - `payload` is the versioned envelope `{ v, data }` (src/server/jobs/envelope.ts), ids only (no PII), and
 *   small: references, never blobs (8 KB in the writer; the CHECK is a backstop).
 * - `next_attempt_at` is both the retry backoff and the relay's lease: claiming a row pushes it 30 s ahead, so
 *   a relay that crashes mid-batch leaves its rows to be claimed again (the job id makes that idempotent).
 * - `completed_at` is set by the worker after the handler succeeds; a replayed job whose row is complete is a
 *   no-op (`relay --replay-since`, RUNBOOK restore). `failed_at` marks a dead-lettered job (failed_jobs).
 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { id, tz } from "./_columns";

export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    queue: text().notNull(),
    jobName: text().notNull(),
    payload: jsonb().$type<unknown>().notNull(),
    createdAt: tz().notNull().defaultNow(),
    nextAttemptAt: tz().notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    dispatchedAt: tz(),
    completedAt: tz(),
    /** Set when the job exhausted its retries (dead-lettered): out of replay and the stale checks, pruned. */
    failedAt: tz(),
  },
  (t) => [
    // The relay's poll: undispatched rows, oldest first (keyset on created_at, id).
    index("outbox_pending_idx")
      .on(t.createdAt, t.id)
      .where(sql`${t.dispatchedAt} IS NULL`),
    // Replay after a restore and the lost-job sweep: dispatched, still open, by dispatch time.
    index("outbox_replay_idx")
      .on(t.dispatchedAt, t.id)
      .where(
        sql`${t.dispatchedAt} IS NOT NULL AND ${t.completedAt} IS NULL AND ${t.failedAt} IS NULL`,
      ),
    // Retention: finished rows (completed or dead-lettered) by age.
    index("outbox_finished_idx")
      .on(sql`coalesce(${t.completedAt}, ${t.failedAt})`)
      .where(sql`${t.completedAt} IS NOT NULL OR ${t.failedAt} IS NOT NULL`),
    check("outbox_attempts_non_negative", sql`${t.attempts} >= 0`),
    check("outbox_payload_small", sql`octet_length(${t.payload}::text) <= 16384`),
    check(
      "outbox_completed_after_dispatch",
      sql`${t.completedAt} IS NULL OR ${t.dispatchedAt} IS NOT NULL`,
    ),
  ],
);
