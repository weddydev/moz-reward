import "server-only";
import { z } from "zod";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import type { LockoutReason } from "@/server/emails/StaffLockoutEmail";
import { ALERT_KINDS } from "@/server/ops/alert-kinds";
import { parseRealtimeEvent, REALTIME_TARGET } from "@/server/realtime/events";

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

/**
 * The scheduler heartbeat's job name. Lives here, not in handlers.ts: the web's readiness route reads it through
 * health-monitor.ts, and handlers.ts pulls in every worker handler (P1-12: the PDF renderer is worker-only).
 */
export const HEARTBEAT_NAME = "scheduled:heartbeat";
export const QUEUE_NAMES = Object.keys(QUEUES) as QueueName[];

/**
 * One job: its payload schema at the current version `v`, and the upgrade chain from every older version
 * (`upgrades[k]` turns a version-k payload into version k + 1). See envelope.ts for how workers use it.
 */
/**
 * Who a job runs as (P0-20, C-30):
 *  - `system`: cross-tenant work under the handler's own systemScope (moz_worker). Only the identity layer or
 *    the system may produce one (writeOutbox refuses a tenant scope), so a request can never get a payload of
 *    its choosing run with BYPASSRLS.
 *  - `tenant`: produced by a customer/shop/admin request; the worker rebuilds that request's scope from the
 *    outbox row and passes it to the handler, whose queries then run under RLS like the request's did.
 */
export type JobRunAs = "system" | "tenant";

export type JobDef<S extends z.ZodType = z.ZodType, R extends JobRunAs = JobRunAs> = {
  v: number;
  schema: S;
  runAs: R;
  upgrades?: Readonly<Record<number, (data: unknown) => unknown>>;
};

export function defineJob<S extends z.ZodType, R extends JobRunAs = "system">(
  schema: S,
  opts: {
    v?: number;
    runAs?: R;
    upgrades?: Readonly<Record<number, (data: unknown) => unknown>>;
  } = {},
): JobDef<S, R> {
  const v = opts.v ?? 1;
  if (!Number.isInteger(v) || v < 1) throw new Error(`Job version must be a positive integer`);
  for (let from = 1; from < v; from++) {
    if (!opts.upgrades?.[from])
      throw new Error(`Job version ${String(v)} lacks upgrade ${String(from)}`);
  }
  const runAs = (opts.runAs ?? "system") as R;
  return { v, schema, runAs, ...(opts.upgrades ? { upgrades: opts.upgrades } : {}) };
}

/** Kept in step with StaffLockoutEmail's LockoutReason (type-checked below). */
const LOCKOUT_REASONS = ["password", "second-factor"] as const satisfies readonly LockoutReason[];

/** P1-10: a realtime hint for up to 100 channels (ids only; re-validated against the event schema). */
const PUBLISH = z
  .object({
    targets: z.array(REALTIME_TARGET).min(1).max(100),
    event: z
      .object({ type: z.enum(REALTIME_EVENTS), data: z.record(z.string(), z.unknown()) })
      .strict()
      .refine((e) => parseRealtimeEvent(e) !== null, "not a valid realtime event"),
  })
  .strict();

/** P1-10: an email for a notification on the email budget list (template from P2-11). */
const NOTIFICATION_EMAIL = z
  .object({ notificationId: z.uuid(), userId: z.uuid(), createdAt: z.iso.datetime() })
  .strict();

/** P1-12: render one receipt's PDF (ids only; the row is read under the producing scope). */
const RECEIPT_PDF = z.object({ receiptId: z.uuid() }).strict();

export const JOBS = {
  notifications: {
    /**
     * P1-10: publish a realtime event to Redis pub/sub. Two names for one handler because the outbox pairs a
     * job's producer with how it runs (C-30): `publish` from request scopes, `publish-system` from jobs.
     */
    publish: defineJob(PUBLISH, { runAs: "tenant" }),
    "publish-system": defineJob(PUBLISH),
    /** C-58: one in-app notice per current member after a programme save that changes rewards/milestones. */
    "loyalty-change-notice": defineJob(
      z
        .object({ shopId: z.uuid(), version: z.number().int().min(1), savedAt: z.iso.datetime() })
        .strict(),
      { runAs: "tenant" },
    ),
  },
  email: {
    /** P1-10: email channel of `notify()` (budget-list types only); placeholder until P2-11's templates. */
    notification: defineJob(NOTIFICATION_EMAIL, { runAs: "tenant" }),
    "notification-system": defineJob(NOTIFICATION_EMAIL),
    /** P0-19/P0-18: tell a staff/admin owner their account was locked (written to the outbox with the audit row). */
    "staff-lockout": defineJob(
      z.object({ userId: z.uuid(), reason: z.enum(LOCKOUT_REASONS) }).strict(),
    ),
    /** P0-13 (C-22): a deduplicated security/ops alert raised in a web process, emailed to both developers. */
    "ops-alert": defineJob(
      z
        .object({
          kind: z.enum(ALERT_KINDS),
          category: z.enum(["security", "ops"]),
          suppressed: z.number().int().min(0),
          summary: z.boolean(),
          at: z.iso.datetime(),
          detail: z.record(z.string(), z.unknown()),
        })
        .strict(),
    ),
  },
  images: {},
  pdf: {
    /** P1-12: a receipt's PDF into the private bucket (written by the approval, or by a download that found none). */
    receipt: defineJob(RECEIPT_PDF, { runAs: "tenant" }),
  },
  "share-cards": {},
  fraud: {},
  scheduled: {
    /** Proves the scheduler and worker are alive; writes job_heartbeats.last_run_at. */
    heartbeat: defineJob(z.object({}).strict()),
    /** P0-18: alerts on outbox rows waiting > 2 min and prunes completed rows past retention. */
    "outbox-sweep": defineJob(z.object({}).strict()),
    /** P1-10: keep monthly notifications partitions 3 months ahead (ARCHITECTURE §4). */
    "partitions-ensure": defineJob(z.object({}).strict()),
    /** P1-11: expire open points requests 24 h after `requested_at` and tell the customer. */
    "requests-expire": defineJob(z.object({}).strict()),
    /** P1-11: remind the shop's team once about a request pending for 30 min. */
    "requests-remind": defineJob(z.object({}).strict()),
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
