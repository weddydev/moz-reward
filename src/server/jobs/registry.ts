import "server-only";
import { z } from "zod";

/**
 * Queue registry (P0-04, ARCHITECTURE §6). Every queue, its worker concurrency and the payload schema of each
 * job it accepts live here, so `enqueue` and the workers are typed from one source. Later tasks add jobs.
 */
export const QUEUES = {
  notifications: { concurrency: 10 },
  email: { concurrency: 5 },
  images: { concurrency: 2 },
  pdf: { concurrency: 2 },
  "share-cards": { concurrency: 2 },
  fraud: { concurrency: 4 },
  scheduled: { concurrency: 1 },
} as const;

export type QueueName = keyof typeof QUEUES;
export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

export const JOBS = {
  notifications: {},
  email: {},
  images: {},
  pdf: {},
  "share-cards": {},
  fraud: {},
  scheduled: {
    /** Proves the scheduler and worker are alive; writes job_heartbeats.last_run_at. */
    heartbeat: z.object({}).strict(),
  },
} as const satisfies Record<QueueName, Record<string, z.ZodType>>;

export type JobName<Q extends QueueName> = keyof (typeof JOBS)[Q] & string;
type Schema<Q extends QueueName, N extends JobName<Q>> = (typeof JOBS)[Q][N] extends z.ZodType
  ? (typeof JOBS)[Q][N]
  : never;
export type JobPayload<Q extends QueueName, N extends JobName<Q>> = z.input<Schema<Q, N>>;

export function payloadSchema(queue: QueueName, name: string): z.ZodType | undefined {
  const jobs: Record<string, z.ZodType> = JOBS[queue];
  return Object.hasOwn(jobs, name) ? jobs[name] : undefined;
}

/** Retries with exponential backoff (2 s, 4 s, …); after the last attempt the job goes to failed_jobs. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
  // Failed jobs live in failed_jobs (Postgres); Redis keeps them a week for debugging.
  removeOnFail: { age: 7 * 24 * 60 * 60 },
} as const;
