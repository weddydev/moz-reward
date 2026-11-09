import "server-only";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { systemScope } from "@/server/authz/scope";
import { log as appLog } from "@/server/log";
import { recordFailedJob } from "@/server/repos/jobs";
import { bullPrefix, createRedis } from "./connection";
import { HANDLERS } from "./handlers";
import { redact, redactText } from "./redact";
import { payloadSchema, QUEUE_NAMES, QUEUES, type QueueName } from "./registry";
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
export type Processor = (job: Job) => Promise<unknown>;
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

/** Wraps a processor with dead-letter recording. Exported so tests can drive any processor through it. */
export function withDeadLetter(
  queue: string,
  processor: Processor,
  record: RecordFailure = recordFailedJob,
): Processor {
  return async (job) => {
    try {
      return await processor(job);
    } catch (err) {
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

/** Validates the payload against the registry and calls the registered handler. */
export function registryProcessor(queue: QueueName): Processor {
  const handlers = HANDLERS[queue] as Record<
    string,
    (payload: unknown, job: Job) => Promise<unknown>
  >;
  return async (job) => {
    const schema = payloadSchema(queue, job.name);
    const handler = Object.hasOwn(handlers, job.name) ? handlers[job.name] : undefined;
    if (!schema || !handler) throw new UnrecoverableError(`No handler for ${queue}:${job.name}`);
    const parsed = schema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError(`Invalid payload for ${queue}:${job.name}`);
    return handler(parsed.data, job);
  };
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
    log("worker.error", { queue, error: redactText(err.message) });
  });
  return { worker, connection };
}

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
