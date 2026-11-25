import "server-only";
import { v5 } from "uuid";
import { newId } from "@/lib/id";
import type { ShopScope, SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { writeOutbox } from "@/server/jobs/outbox";
import { MAX_TARGETS, publishRealtime } from "@/server/realtime/publish";
import { insertNotifications } from "@/server/repos/notifications";
import { NOTIFICATION_TYPES, type NotificationPayload, type NotificationType } from "./types";

/**
 * The notification dispatch interface (P1-10, ARCHITECTURE §7). Two channels in P1: **in-app** (a row plus a
 * realtime `notification` hint) and **email** (budget-list types only; template from P2-11). Nothing is sent
 * inline: the row and every outbox row are written in the caller's transaction, so a rolled-back change leaves
 * no notification, no email and no realtime event; the relay delivers after commit. P3-07 adds push, preferences
 * and the inbox behind this same interface.
 */
export type NotifyInput<T extends NotificationType> = {
  type: T;
  payload: NotificationPayload<T>;
  /** The shop the notice is about (required for a shop team: RLS checks the recipient belongs to it). */
  shopId?: string;
  /**
   * Makes the notice idempotent: the id is derived from this key and the recipient, and `createdAt` must be
   * fixed too (the primary key is (id, created_at)), so a retried job inserts nothing twice.
   */
  dedupe?: { key: string; createdAt: Date };
};

/** Namespace for deterministic notification ids (uuid v5). */
const NOTIFY_NS = "6f1f5a8e-3c55-4f0b-9a71-5d1f3e2b7c10";

export const notificationIdFor = (dedupeKey: string, userId: string): string =>
  v5(`${dedupeKey}:${userId}`, NOTIFY_NS);

/** Notifies each recipient (≤ 100 per call) of one event; returns the notification ids. */
export async function notify<T extends NotificationType>(
  // A team (its current members/staff, RLS) or a job; customers never notify (no INSERT policy for them).
  scope: ShopScope | SystemScope,
  tx: Transaction,
  recipients: readonly string[],
  input: NotifyInput<T>,
): Promise<string[]> {
  if (recipients.length === 0) return [];
  if (recipients.length > MAX_TARGETS)
    throw new Error(`notify: at most ${String(MAX_TARGETS)} recipients per call`);
  const def = NOTIFICATION_TYPES[input.type];
  if (def.category !== "transactional")
    throw new Error("notify: marketing needs the consent gate (P3-07)");
  if (scope.kind === "shop" && input.shopId !== scope.shopId) {
    throw new Error("notify: a shop team notifies about its own shop only");
  }
  const payload = def.payload.parse(input.payload) as Record<string, unknown>;
  const now = new Date();
  const rows = [...new Set(recipients)].map((userId) => ({
    id: input.dedupe ? notificationIdFor(input.dedupe.key, userId) : newId(),
    userId,
    shopId: input.shopId ?? null,
    type: input.type,
    category: def.category,
    payload,
    createdAt: input.dedupe?.createdAt ?? now,
  }));
  await insertNotifications(scope, tx, rows);
  // One hint to the recipients' own channels (one outbox row per call, not per recipient). A duplicate hint for
  // an already-present idempotent row is harmless: the client only refetches.
  const only = rows.length === 1 ? rows[0] : undefined;
  await publishRealtime(
    scope,
    tx,
    rows.map((r) => ({ kind: "user" as const, id: r.userId })),
    { type: "notification", data: only ? { notificationId: only.id } : {} },
  );
  if (def.email !== null) {
    for (const row of rows) {
      const job = {
        notificationId: row.id,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
      };
      if (scope.kind === "system")
        await writeOutbox(scope, tx, "email", "notification-system", job);
      else await writeOutbox(scope, tx, "email", "notification", job);
    }
  }
  return rows.map((r) => r.id);
}
