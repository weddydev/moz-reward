import "server-only";
import { sendStaffLockoutEmail } from "@/server/auth/lockout-email";
import { systemScope, type TenantScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { sendLoyaltyChangeNotices } from "@/server/notifications/loyalty-notice";
import { deliverAlertEmail } from "@/server/ops/alerts";
import { deliverRealtime } from "@/server/realtime/publish";
import { touchHeartbeat } from "@/server/repos/jobs";
import { ensureNotificationPartitions } from "@/server/repos/notifications";
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

/** Months of notifications partitions kept ahead (the health monitor alerts below 2). */
export const PARTITION_MONTHS_AHEAD = 3;

export const HANDLERS: Handlers = {
  notifications: {
    publish: (payload) => deliverRealtime(payload),
    "publish-system": (payload) => deliverRealtime(payload),
    "loyalty-change-notice": (payload, _job, { scope }) => sendLoyaltyChangeNotices(payload, scope),
  },
  email: {
    // P1-10: no P1 notification type has email (all in-app). The template and the recipient re-check (its link
    // to the shop, before any address is resolved) arrive with P2-11 (CARRIED_LATER).
    notification: ({ notificationId }) => {
      log().info({ notificationId }, "notification email skipped: templates arrive with P2-11");
      return Promise.resolve();
    },
    "notification-system": ({ notificationId }) => {
      log().info({ notificationId }, "notification email skipped: templates arrive with P2-11");
      return Promise.resolve();
    },
    "staff-lockout": ({ userId, reason }) => sendStaffLockoutEmail(userId, reason),
    "ops-alert": ({ at, ...alert }) => deliverAlertEmail({ ...alert, at: new Date(at) }),
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
    "partitions-ensure": () => ensureNotificationPartitions(JOBS_SCOPE, PARTITION_MONTHS_AHEAD),
  },
};
