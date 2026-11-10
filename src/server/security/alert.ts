import "server-only";
import { log } from "@/server/log";

/**
 * Security alerts (SECURITY §12: "account lockouts … all alerts go to both developers"). Today an alert is a
 * structured log line with an `alert` field; P0-13 routes this one function to Sentry / the health-job email
 * (CARRIED C-22). Callers never pass personal data: hashed keys and counts only.
 */
export type SecurityAlertEvent = "auth.lockout";

export function securityAlert(event: SecurityAlertEvent, detail: Record<string, unknown>): void {
  log().warn({ alert: event, category: "security", ...detail }, `security alert: ${event}`);
}

/**
 * Operational alerts (P0-18: outbox rows waiting > 2 min, dispatched jobs lost from redis-queue). Same route as security alerts once P0-13 lands
 * (C-22: both developers, deduplicated). Ids and counts only.
 */
export type OpsAlertEvent = "outbox.stale" | "outbox.lost";

export function opsAlert(event: OpsAlertEvent, detail: Record<string, unknown>): void {
  log().warn({ alert: event, category: "ops", ...detail }, `ops alert: ${event}`);
}
