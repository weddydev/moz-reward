import "server-only";
import { sql } from "drizzle-orm";
import type { SystemScope } from "@/server/authz/scope";
import { failedJobs, jobHeartbeats } from "@/server/db/schema";
import { dbFor } from "./_base";

/** Dead-letter entry for a job that exhausted its retries. Re-failing the same job updates its row. */
export async function recordFailedJob(
  scope: SystemScope,
  row: {
    queue: string;
    jobName: string;
    jobId: string;
    payload: unknown;
    error: string;
    attempts: number;
  },
): Promise<void> {
  await dbFor(scope)
    .insert(failedJobs)
    .values(row)
    .onConflictDoUpdate({
      target: [failedJobs.queue, failedJobs.jobId],
      set: {
        payload: row.payload,
        error: row.error,
        attempts: row.attempts,
        failedAt: sql`now()`,
        resolvedAt: null,
      },
    });
}

/** Records that a scheduled job ran now (health check / admin System page). */
export async function touchHeartbeat(scope: SystemScope, name: string): Promise<void> {
  await dbFor(scope)
    .insert(jobHeartbeats)
    .values({ name, lastRunAt: sql`now()` })
    .onConflictDoUpdate({ target: jobHeartbeats.name, set: { lastRunAt: sql`now()` } });
}
