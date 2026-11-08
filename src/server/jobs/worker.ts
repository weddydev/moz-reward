import "server-only";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { systemScope } from "@/server/authz/scope";
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
 */
export type Processor = (job: Job) => Promise<unknown>;

const DLQ_SCOPE = systemScope("dead-letter bookkeeping for failed background jobs");

export const isFinalAttempt = (job: Pick<Job, "attemptsMade" | "opts">, err: unknown): boolean =>
  err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

const log = (event: string, fields: Record<string, unknown>): void => {
  console.warn(JSON.stringify({ at: new Date().toISOString(), src: "worker", event, ...fields }));
};

/** Wraps a processor with dead-letter recording. Exported so tests can drive any processor through it. */
export function withDeadLetter(queue: string, processor: Processor): Processor {
  return async (job) => {
    try {
      return await processor(job);
    } catch (err) {
      const final = isFinalAttempt(job, err);
      const message = redactText(
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
      log(final ? "job.dead_lettered" : "job.retrying", {
        queue,
        job: job.name,
        id: job.id,
        attempt: job.attemptsMade + 1,
        error: message,
      });
      if (final) {
        await recordFailedJob(DLQ_SCOPE, {
          queue,
          jobName: job.name,
          jobId: job.id ?? "unknown",
          payload: redact(job.data),
          error: message,
          attempts: job.attemptsMade + 1,
        });
      }
      throw err;
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
  },
): { worker: Worker; connection: Redis } {
  const connection = opts.connection ?? createRedis("worker");
  const worker = new Worker(queue, withDeadLetter(queue, processor), {
    connection,
    prefix: bullPrefix(),
    concurrency: opts.concurrency,
    ...(opts.lockDuration ? { lockDuration: opts.lockDuration } : {}),
    ...(opts.stalledInterval ? { stalledInterval: opts.stalledInterval } : {}),
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
