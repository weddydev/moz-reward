import "server-only";
import { createHmac } from "node:crypto";
import { auditActor, type Scope } from "@/server/authz/scope";
import type { Database, Transaction } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { REDACTED, redactText } from "@/server/jobs/redact";
import { purposeKey } from "@/server/security/keys";

export type AuditEntry = {
  actorId: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Never include phone numbers, emails, codes or tokens (SECURITY §7); they are scrubbed anyway. */
  meta?: Record<string, unknown>;
  ip?: string | null;
};

/** IPs are stored as a keyed hash so abuse can be correlated without keeping raw addresses. */
export const hashIp = (ip: string): string =>
  createHmac("sha256", purposeKey("ip-hash")).update(ip).digest("base64url").slice(0, 22);

/** Keys whose values are personal data or secrets, wherever they appear in meta. */
const SENSITIVE_KEY =
  /(e-?mail|phone|mobile|token|secret|password|passcode|otp|code|apikey|api_key|cookie|authorization|postcode|address|dob|birth)/i;
const MAX_DEPTH = 4;

/**
 * Audit meta keeps its shape and business facts (amounts, statuses, ids); values under sensitive keys are
 * replaced, and emails / phone numbers / URL tokens inside free text are scrubbed. Audit rows are permanent
 * (append-only), so this runs on every write.
 */
export function scrubAuditMeta(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => scrubAuditMeta(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      SENSITIVE_KEY.test(k) ? REDACTED : scrubAuditMeta(v, depth + 1),
    ]),
  );
}

/** Append an audit row (inside the caller's transaction when given). */
export async function recordAudit(
  dbOrTx: Database | Transaction,
  entry: AuditEntry,
): Promise<void> {
  await dbOrTx.insert(auditLogs).values({
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    meta: scrubAuditMeta(entry.meta ?? {}) as Record<string, unknown>,
    ipHash: entry.ip ? hashIp(entry.ip) : null,
  });
}

/**
 * Audit writer (P0-05, SECURITY §12): `audit(tx, { actor, action, entity, entityId, meta, ip })`. The actor
 * is the caller's authorised scope, so the row always names who acted in which role. Write it inside the
 * same transaction as the change it records.
 */
export function audit(
  dbOrTx: Database | Transaction,
  entry: { actor: Scope } & Omit<AuditEntry, "actorId" | "actorRole">,
): Promise<void> {
  const { actor, ...rest } = entry;
  return recordAudit(dbOrTx, { ...auditActor(actor), ...rest });
}
