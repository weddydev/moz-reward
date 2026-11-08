/**
 * Background job bookkeeping (P0-04, ARCHITECTURE §6). `failed_jobs` is the dead-letter table shown in super
 * admin later: one row per job that exhausted its retries (payload redacted). `job_heartbeats` records the
 * last run of scheduled jobs for the health check and the admin System page.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps, tz } from "./_columns";

export const failedJobs = pgTable(
  "failed_jobs",
  {
    id: id(),
    queue: text().notNull(),
    jobName: text().notNull(),
    jobId: text().notNull(),
    /** Redacted copy of the payload (src/server/jobs/redact.ts): never personal data or secrets. */
    payload: jsonb().$type<unknown>().notNull(),
    error: text().notNull(),
    attempts: integer().notNull(),
    failedAt: tz().notNull().defaultNow(),
    /** Set when an admin retries or dismisses the job. */
    resolvedAt: tz(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("failed_jobs_queue_job_uq").on(t.queue, t.jobId),
    index("failed_jobs_unresolved_idx")
      .on(t.failedAt)
      .where(sql`${t.resolvedAt} IS NULL`),
    check("failed_jobs_attempts_positive", sql`${t.attempts} > 0`),
  ],
);

export const jobHeartbeats = pgTable("job_heartbeats", {
  name: text().primaryKey(),
  lastRunAt: tz().notNull(),
  ...timestamps(),
});
