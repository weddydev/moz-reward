import "server-only";
import { z } from "zod";
import type { LockoutReason } from "@/server/emails/StaffLockoutEmail";

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

/**
 * One job: its payload schema at the current version `v`, and the upgrade chain from every older version
 * (`upgrades[k]` turns a version-k payload into version k + 1). See envelope.ts for how workers use it.
 */
export type JobDef<S extends z.ZodType = z.ZodType> = {
  v: number;
  schema: S;
  upgrades?: Readonly<Record<number, (data: unknown) => unknown>>;
};

export function defineJob<S extends z.ZodType>(
  schema: S,
  opts: { v?: number; upgrades?: Readonly<Record<number, (data: unknown) => unknown>> } = {},
): JobDef<S> {
  const v = opts.v ?? 1;
  if (!Number.isInteger(v) || v < 1) throw new Error(`Job version must be a positive integer`);
  for (let from = 1; from < v; from++) {
    if (!opts.upgrades?.[from])
      throw new Error(`Job version ${String(v)} lacks upgrade ${String(from)}`);
  }
  return { v, schema, ...(opts.upgrades ? { upgrades: opts.upgrades } : {}) };
}

/** Kept in step with StaffLockoutEmail's LockoutReason (type-checked below). */
const LOCKOUT_REASONS = ["password", "second-factor"] as const satisfies readonly LockoutReason[];

export const JOBS = {
  notifications: {},
  email: {
    /** P0-19/P0-18: tell a staff/admin owner their account was locked (written to the outbox with the audit row). */
    "staff-lockout": defineJob(
      z.object({ userId: z.uuid(), reason: z.enum(LOCKOUT_REASONS) }).strict(),
    ),
  },
  images: {},
  pdf: {},
  "share-cards": {},
  fraud: {},
  scheduled: {
    /** Proves the scheduler and worker are alive; writes job_heartbeats.last_run_at. */
    heartbeat: defineJob(z.object({}).strict()),
    /** P0-18: alerts on outbox rows waiting > 2 min and prunes completed rows past retention. */
    "outbox-sweep": defineJob(z.object({}).strict()),
  },
} as const satisfies Record<QueueName, Record<string, JobDef>>;

export type JobName<Q extends QueueName> = keyof (typeof JOBS)[Q] & string;
type Schema<Q extends QueueName, N extends JobName<Q>> =
  (typeof JOBS)[Q][N] extends JobDef<infer S> ? S : never;
export type JobPayload<Q extends QueueName, N extends JobName<Q>> = z.input<Schema<Q, N>>;

export function jobDef(queue: QueueName | (string & {}), name: string): JobDef | undefined {
  if (!Object.hasOwn(JOBS, queue)) return undefined;
  const jobs: Record<string, JobDef> = JOBS[queue as QueueName];
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
