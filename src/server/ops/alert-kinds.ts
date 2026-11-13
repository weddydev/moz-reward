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
  /** C-24: an admin account was refused from an address outside ADMIN_IP_ALLOWLIST. */
  "auth.admin_ip_denied",
  /** P1-01: no unique public code after every retry (shop code, member ID …); nothing was created. */
  "codes.exhausted",
  /** Sent once a day at most: the daily alert ceiling was reached; later alerts are in the log only. */
  "alert.ceiling",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
