import "server-only";
import { sendStaffLockoutEmail } from "@/server/auth/lockout-email";
import { systemScope, type TenantScope } from "@/server/authz/scope";
import { touchHeartbeat } from "@/server/repos/jobs";
import { sweepOutbox } from "./relay";
import type { JobDef, JOBS, JobRunAs, QueueName } from "./registry";
import type { Job } from "bullmq";
import type { z } from "zod";

/**
 * What a handler gets besides its payload (P0-20, C-30): a tenant job gets the scope of the request that wrote
 * its outbox row (its queries run under RLS); a system job gets none and uses its own systemScope.
 */
export type JobContext<R extends JobRunAs = JobRunAs> = R extends "tenant"
  ? { scope: TenantScope }
  : { scope: null };

/** One handler per registered job. Handlers must be idempotent: a retry may run them again. */
export type Handlers = {
  [Q in QueueName]: {
    [N in keyof (typeof JOBS)[Q]]: (
      payload: (typeof JOBS)[Q][N] extends JobDef<infer S> ? z.output<S> : never,
      job: Job,
      ctx: (typeof JOBS)[Q][N] extends JobDef<z.ZodType, infer R> ? JobContext<R> : never,
    ) => Promise<unknown>;
  };
};

const JOBS_SCOPE = systemScope("scheduled background jobs run without a user");

export const HEARTBEAT_NAME = "scheduled:heartbeat";

export const HANDLERS: Handlers = {
  notifications: {},
  email: {
    "staff-lockout": ({ userId, reason }) => sendStaffLockoutEmail(userId, reason),
  },
  images: {},
  pdf: {},
  "share-cards": {},
  fraud: {},
  scheduled: {
    heartbeat: async () => {
      await touchHeartbeat(JOBS_SCOPE, HEARTBEAT_NAME);
    },
    "outbox-sweep": () => sweepOutbox(),
  },
};
