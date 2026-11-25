import "server-only";
import { sendStaffLockoutEmail } from "@/server/auth/lockout-email";
import { systemScope, type TenantScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { sendLoyaltyChangeNotices } from "@/server/notifications/loyalty-notice";
import { deliverAlertEmail } from "@/server/ops/alerts";
import { deliverRealtime } from "@/server/realtime/publish";
import { touchHeartbeat } from "@/server/repos/jobs";
import { ensureNotificationPartitions } from "@/server/repos/notifications";
import { expirePointRequests, remindPointRequests } from "@/server/services/point-request-jobs";
import { checkAwardDevice } from "./fraud-award-check";
import { HEARTBEAT_NAME, type JobDef, type JOBS, type JobRunAs, type QueueName } from "./registry";
import { sweepOutbox } from "./relay";
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
  pdf: {
    // Loaded on first use: pdfkit stays in the worker (nothing the web imports reaches the renderer).
    receipt: async (payload, _job, { scope }) =>
      (await import("./receipt-pdf-job")).renderReceiptJob(payload, scope),
  },
  "share-cards": {},
  fraud: {
    "award-check": (payload, _job, { scope }) => checkAwardDevice(payload, scope),
  },
  scheduled: {
    heartbeat: async () => {
      await touchHeartbeat(JOBS_SCOPE, HEARTBEAT_NAME);
    },
    "outbox-sweep": () => sweepOutbox(),
    "partitions-ensure": () => ensureNotificationPartitions(JOBS_SCOPE, PARTITION_MONTHS_AHEAD),
    "requests-expire": () => expirePointRequests(JOBS_SCOPE),
    "requests-remind": () => remindPointRequests(JOBS_SCOPE),
  },
};
