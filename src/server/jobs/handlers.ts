import "server-only";
import { sendStaffLockoutEmail } from "@/server/auth/lockout-email";
import { systemScope } from "@/server/authz/scope";
import { touchHeartbeat } from "@/server/repos/jobs";
import { sweepOutbox } from "./relay";
import type { JobDef, JOBS, QueueName } from "./registry";
import type { Job } from "bullmq";
import type { z } from "zod";

/** One handler per registered job. Handlers must be idempotent: a retry may run them again. */
export type Handlers = {
  [Q in QueueName]: {
    [N in keyof (typeof JOBS)[Q]]: (
      payload: (typeof JOBS)[Q][N] extends JobDef<infer S> ? z.output<S> : never,
      job: Job,
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
