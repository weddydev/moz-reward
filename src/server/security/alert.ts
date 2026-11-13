import "server-only";
import { log } from "@/server/log";
import { raiseAlert } from "@/server/ops/alerts";

/**
 * Security and operational alerts (SECURITY §12: "account lockouts … all alerts go to both developers";
 * P0-18 outbox health). Each is a structured log line with an `alert` field, then goes to both developers by
 * email, deduplicated per kind (one email per 5 minutes with a count of the rest): src/server/ops/alerts.ts
 * (P0-13, C-22). Callers never pass personal data: hashed keys, ids and counts only.
 */
export type SecurityAlertEvent = "auth.lockout" | "auth.admin_ip_denied";

export function securityAlert(event: SecurityAlertEvent, detail: Record<string, unknown>): void {
  log().warn({ alert: event, category: "security", ...detail }, `security alert: ${event}`);
  raiseAlert({ kind: event, category: "security", detail });
}

/**
 * Operational alerts (P0-18: outbox rows waiting > 2 min, dispatched jobs lost from redis-queue; P1-01: a public
 * code could not be generated).
 */
export type OpsAlertEvent = "outbox.stale" | "outbox.lost" | "codes.exhausted";

export function opsAlert(event: OpsAlertEvent, detail: Record<string, unknown>): void {
  log().warn({ alert: event, category: "ops", ...detail }, `ops alert: ${event}`);
  raiseAlert({ kind: event, category: "ops", detail });
}
