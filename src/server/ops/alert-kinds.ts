import "server-only";

/** Every alert kind (P0-13). Its own module so the job registry can name them without importing delivery. */
export const ALERT_KINDS = [
  "auth.lockout",
  "outbox.stale",
  "outbox.lost",
  "error.unexpected",
  "health.db",
  "health.redis",
  "health.scheduler",
  "health.queue_lag",
  "health.failed_jobs",
  "health.disk",
  "health.backup",
  "quota.email",
  "quota.sentry",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
