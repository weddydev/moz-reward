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
  /** P0-15 C1b: the staging origin lock's daily refresh failed, alerted or stopped running. */
  "health.origin_firewall",
  "quota.email",
  "quota.sentry",
  /** C-24: an admin account was refused from an address outside ADMIN_IP_ALLOWLIST. */
  "auth.admin_ip_denied",
  /** P1-01: no unique public code after every retry (shop code, member ID …); nothing was created. */
  "codes.exhausted",
  /** P1-10: a notice job could not read what it announces (e.g. the owner lost the role before it ran). */
  "notifications.undelivered",
  /** P1-10: fewer than 2 months of notifications partitions exist ahead (ARCHITECTURE §4). */
  "health.partitions",
  /** P1-13: a scheduled sweep (points expiry, request expiry/reminder) is late or ran too long (sweeps.ts). */
  "health.sweep",
  /** P1-17: the nightly reconciliation found new mismatches (counts per check; details on the System page). */
  "integrity.issue",
  /** Sent once a day at most: the daily alert ceiling was reached; later alerts are in the log only. */
  "alert.ceiling",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
