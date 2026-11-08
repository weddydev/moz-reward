import "server-only";
import { createHmac } from "node:crypto";
import type { Database, Transaction } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { env } from "@/server/env";

export type AuditEntry = {
  actorId: string | null;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | null;
  /** Never include phone numbers, emails, codes or tokens (SECURITY §7). */
  meta?: Record<string, unknown>;
  ip?: string | null;
};

/** IPs are stored as a keyed hash so abuse can be correlated without keeping raw addresses. */
export const hashIp = (ip: string): string =>
  createHmac("sha256", env().AUTH_SECRET).update(ip).digest("base64url").slice(0, 22);

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
    meta: entry.meta ?? {},
    ipHash: entry.ip ? hashIp(entry.ip) : null,
  });
}
