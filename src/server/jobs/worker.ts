import "server-only";
import { DelayedError, type Job, UnrecoverableError, Worker } from "bullmq";
import { systemScope, type TenantScope, tenantScopeFromOutbox } from "@/server/authz/scope";
import { log as appLog } from "@/server/log";
import { captureJobFailure } from "@/server/observability/sentry";
import { recordFailedJob } from "@/server/repos/jobs";
import { markOutboxCompleted, markOutboxFailed, outboxJobFacts } from "@/server/repos/outbox";
import { bullPrefix, createRedis } from "./connection";
import { isEnvelope, openEnvelope } from "./envelope";
import { HANDLERS } from "./handlers";
import { createLogThrottle } from "./log-throttle";
import { redact, redactText } from "./redact";
import { type JobDef, jobDef, QUEUE_NAMES, QUEUES, type QueueName } from "./registry";
import type { Redis } from "ioredis";

/**
 * Workers (P0-04). Each queue gets a BullMQ worker with its own connection and concurrency. A failure is
 * retried with backoff; on the final attempt (or an UnrecoverableError, e.g. a malformed payload) the job is
 * written to failed_jobs, redacted, *before* BullMQ marks it failed, so no dead letter is lost on shutdown.
 *
 * Backstop: the worker's `failed` event writes the same row (idempotent upsert on queue + job id) whenever a
 * job has finally failed. That covers the two paths the wrapper cannot: a job that stalled past
 * `maxStalledCount` (BullMQ fails it with a deferred UnrecoverableError without calling the processor) and a
 * dead-letter write that threw on the final attempt (e.g. the database was briefly unreachable).
 */
export type Processor = (job: Job, token?: string) => Promise<unknown>;
/** Writes the dead-letter row (injectable so tests can simulate a failing database). */
export type RecordFailure = typeof recordFailedJob;

const DLQ_SCOPE = systemScope("dead-letter bookkeeping for failed background jobs");

export const isFinalAttempt = (job: Pick<Job, "attemptsMade" | "opts">, err: unknown): boolean =>
  err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

const log = (event: string, fields: Record<string, unknown>): void => {
  appLog()
    .child({ src: "worker" })
    .warn({ event, ...fields }, event);
};

const errorText = (err: unknown): string =>
  redactText(err instanceof Error ? `${err.name}: ${err.message}` : String(err));

const deadLetterRow = (
  queue: string,
  job: Job,
  error: string,
  attempts: number,
): Parameters<RecordFailure>[1] => ({
  queue,
  jobName: job.name,
  jobId: job.id ?? `missing-id-${job.timestamp}-${job.name}`,
  payload: redact(job.data),
  error,
  attempts,
});

const OUTBOX_DLQ_SCOPE = systemScope(
  "dead-letter bookkeeping: close the outbox row of a failed job",
);

/** A dead-lettered outbox job leaves replay and the sweeps (its failure is in failed_jobs). */
async function closeFailedOutboxRow(job: Job): Promise<void> {
  const data: unknown = job.data;
  if (!isEnvelope(data) || !data.outboxId) return;
  try {
    await markOutboxFailed(OUTBOX_DLQ_SCOPE, data.outboxId);
  } catch (err) {
    log("job.outbox_fail_mark_failed", { id: job.id, error: errorText(err) });
  }
}

/** Wraps a processor with dead-letter recording. Exported so tests can drive any processor through it. */
export function withDeadLetter(
  queue: string,
  processor: Processor,
  record: RecordFailure = recordFailedJob,
): Processor {
  return async (job, token) => {
    try {
      return await processor(job, token);
    } catch (err) {
      // Deferred on purpose (moved to delayed by the processor): not a failure, not an attempt.
      if (err instanceof DelayedError) throw err;
      const final = isFinalAttempt(job, err);
      const message = errorText(err);
      log(final ? "job.dead_lettered" : "job.retrying", {
        queue,
        job: job.name,
        id: job.id,
        attempt: job.attemptsMade + 1,
        error: message,
      });
      if (final) {
        captureJobFailure(err, { queue, job: job.name });
        await closeFailedOutboxRow(job);
        try {
          await record(DLQ_SCOPE, deadLetterRow(queue, job, message, job.attemptsMade + 1));
        } catch (dbErr) {
          // Keep the job's own error: BullMQ must record why the job failed, not why bookkeeping failed.
          // The `failed` event backstop retries the write once BullMQ has marked the job failed.
          log("job.dead_letter_write_failed", { queue, id: job.id, error: errorText(dbErr) });
        }
      }
      throw err;
    }
  };
}

/**
 * `failed` event backstop. BullMQ sets `finishedOn` only when the job has really failed (no retry left), so
 * retries are ignored. Never throws: an event-listener rejection would be unhandled.
 */
export function onJobFailed(
  queue: string,
  record: RecordFailure = recordFailedJob,
): (job: Job | undefined, err: Error) => Promise<void> {
  return async (job, err) => {
    if (!job || typeof job.finishedOn !== "number") return;
    await closeFailedOutboxRow(job);
    try {
      await record(DLQ_SCOPE, deadLetterRow(queue, job, errorText(err), job.attemptsMade));
    } catch (dbErr) {
      log("job.dead_letter_lost", {
        queue,
        job: job.name,
        id: job.id,
        error: errorText(err),
        cause: errorText(dbErr),
      });
    }
  };
}

/** How long a deferred job (newer payload version, unknown name) waits before its next try (rolling deploy). */
export const FUTURE_VERSION_DELAY_MS = 30_000;
/** How long a job whose name this worker doesn't know keeps waiting for a newer worker. */
export const UNKNOWN_JOB_GRACE_MS = 60 * 60_000;

const OUTBOX_SCOPE = systemScope("worker: outbox completion bookkeeping for every tenant");

export type OutboxBookkeeping = {
  /** Completion and originating scope of the row, or null when the row no longer exists. */
  facts: (id: string) => ReturnType<typeof outboxJobFacts>;
  markCompleted: (id: string) => Promise<void>;
};

const outboxBookkeeping: OutboxBookkeeping = {
  facts: (id) => outboxJobFacts(OUTBOX_SCOPE, id),
  markCompleted: (id) => markOutboxCompleted(OUTBOX_SCOPE, id),
};

type Entry = {
  def: JobDef;
  handler: (payload: unknown, job: Job, ctx: { scope: TenantScope | null }) => Promise<unknown>;
};

/**
 * Opens the versioned envelope (upgrading old payloads), defers payloads from a newer version, skips an
 * outbox job whose side effect is already recorded (replay), runs the handler and records completion.
 * `lookup` is injectable so tests can run a registry of their own (payload versioning, AC4).
 */
export function jobProcessor(
  queue: string,
  lookup: (name: string) => Entry | undefined,
  outboxRows: OutboxBookkeeping = outboxBookkeeping,
): Processor {
  return async (job, token) => {
    const entry = lookup(job.name);
    if (!entry) {
      // Probably written by a newer release (rolling deploy, rollback): wait for a worker that knows it, for
      // a while; after that it is a real bug and goes to the dead-letter table.
      if (Date.now() - job.timestamp < UNKNOWN_JOB_GRACE_MS) {
        log("job.deferred_unknown_name", { queue, job: job.name, id: job.id });
        await job.moveToDelayed(Date.now() + FUTURE_VERSION_DELAY_MS, token);
        throw new DelayedError();
      }
      throw new UnrecoverableError(`No handler for ${queue}:${job.name}`);
    }
    const opened = openEnvelope(entry.def, job.data);
    if (opened.kind === "future") {
      log("job.deferred_newer_version", { queue, job: job.name, id: job.id, v: opened.v });
      await job.moveToDelayed(Date.now() + FUTURE_VERSION_DELAY_MS, token);
      throw new DelayedError();
    }
    if (opened.kind === "invalid") {
      throw new UnrecoverableError(`Invalid payload for ${queue}:${job.name} (${opened.reason})`);
    }
    const { outboxId } = opened;
    const facts = outboxId ? await outboxRows.facts(outboxId) : null;
    if (facts?.completed) {
      log("job.already_completed", { queue, job: job.name, id: job.id });
      return { skipped: "completed" };
    }
    // C-30: a tenant job runs under the scope that wrote its outbox row (read from the database, never from
    // the job data in Redis), so its handler meets the same RLS walls as the request that produced it.
    let scope: TenantScope | null = null;
    // A system job (BYPASSRLS) runs only from a row the identity layer or the system wrote (review HIGH-1).
    // An outbox id whose row is gone is never legitimate (the sweep prunes only completed/failed rows): a
    // forged envelope in Redis must not run with BYPASSRLS (re-review 3).
    if (entry.def.runAs === "system" && outboxId && !facts) {
      throw new UnrecoverableError(`${queue}:${job.name} is a system job without its outbox row`);
    }
    if (
      entry.def.runAs === "system" &&
      facts &&
      facts.scopeKind !== "auth" &&
      facts.scopeKind !== "system"
    ) {
      throw new UnrecoverableError(
        `${queue}:${job.name} is a system job written by a ${facts.scopeKind} scope`,
      );
    }
    if (entry.def.runAs === "tenant") {
      if (!facts)
        throw new UnrecoverableError(`${queue}:${job.name} is a tenant job without its outbox row`);
      scope = tenantScopeFromOutbox(facts);
      if (!scope) {
        throw new UnrecoverableError(
          `${queue}:${job.name}: outbox row was not written by a tenant scope`,
        );
      }
    }
    const result = await entry.handler(opened.data, job, { scope });
    if (outboxId) {
      try {
        await outboxRows.markCompleted(outboxId);
      } catch (err) {
        // The side effect happened; failing the job now would repeat it. Only a later replay could.
        log("job.completion_not_recorded", { queue, id: job.id, error: errorText(err) });
      }
    }
    return result;
  };
}

/** The registry's jobs and handlers for one queue. */
export function registryProcessor(queue: QueueName): Processor {
  const handlers = HANDLERS[queue] as Record<string, Entry["handler"]>;
  return jobProcessor(queue, (name) => {
    const def = jobDef(queue, name);
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    return def && handler ? { def, handler } : undefined;
  });
}

export type RunningWorkers = { workers: Worker[]; close: () => Promise<void> };

export function createQueueWorker(
  queue: string,
  processor: Processor,
  opts: {
    concurrency: number;
    connection?: Redis;
    /** Lock/stall timings (defaults 30 s / 30 s). Tests shorten them to prove crash recovery quickly. */
    lockDuration?: number;
    stalledInterval?: number;
    recordFailure?: RecordFailure;
  },
): { worker: Worker; connection: Redis } {
  const connection = opts.connection ?? createRedis("worker");
  const record = opts.recordFailure ?? recordFailedJob;
  const worker = new Worker(queue, withDeadLetter(queue, processor, record), {
    connection,
    prefix: bullPrefix(),
    concurrency: opts.concurrency,
    ...(opts.lockDuration ? { lockDuration: opts.lockDuration } : {}),
    ...(opts.stalledInterval ? { stalledInterval: opts.stalledInterval } : {}),
  });
  const backstop = onJobFailed(queue, record);
  worker.on("failed", (job, err) => {
    void backstop(job, err);
  });
  worker.on("error", (err) => {
    // While Redis is down this fires several times a second per queue: one line per kind per 30 s.
    const code = (err as { code?: unknown }).code;
    const error = redactText(err.message || (typeof code === "string" ? code : err.name));
    workerErrorThrottle(`${queue}:${error}`, (repeated) => {
      log("worker.error", { queue, error, ...(repeated > 0 ? { repeated } : {}) });
    });
  });
  return { worker, connection };
}

const workerErrorThrottle = createLogThrottle({ windowMs: 30_000 });

/** Starts one worker per queue. `close()` waits for in-flight jobs to finish, then closes connections. */
export function startWorkers(queues: readonly QueueName[] = QUEUE_NAMES): RunningWorkers {
  const started = queues.map((q) =>
    createQueueWorker(q, registryProcessor(q), { concurrency: QUEUES[q].concurrency }),
  );
  const workers = started.map((s) => s.worker);
  return {
    workers,
    close: async () => {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(started.map((s) => s.connection.quit()));
    },
  };
}
