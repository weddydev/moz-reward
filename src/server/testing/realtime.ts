import "server-only";
/**
 * The worker's realtime delivery for E2E (P1-12): no worker runs in E2E, so a spec asks for the realtime hints
 * its own shop's actions queued and gets them delivered exactly as the `notifications/publish` job does
 * (`deliverRealtime` on the row's payload), then marked dispatched and completed. Only rows that concern
 * `shopId` (written in its scope, or targeting its stream), so parallel specs never take each other's rows.
 */
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { testOwnerDb as db } from "@/server/db/client";
import { outbox } from "@/server/db/schema";
import type { RealtimeTarget } from "@/server/realtime/events";
import { deliverRealtime } from "@/server/realtime/publish";

/** Delivers up to 100 of the shop's queued realtime hints; returns how many were delivered. */
export async function relayShopRealtime(shopId: string): Promise<number> {
  return db().transaction(async (tx) => {
    const rows = await tx
      .select({ id: outbox.id, payload: outbox.payload })
      .from(outbox)
      .where(
        and(
          eq(outbox.queue, "notifications"),
          inArray(outbox.jobName, ["publish", "publish-system"]),
          isNull(outbox.dispatchedAt),
          or(
            eq(outbox.scopeShopId, shopId),
            sql`${outbox.payload} @> ${JSON.stringify({ data: { targets: [{ kind: "shop", id: shopId }] } })}::jsonb`,
          ),
        ),
      )
      .orderBy(asc(outbox.createdAt), asc(outbox.id))
      .limit(100)
      .for("update", { skipLocked: true });
    for (const row of rows) {
      // Outbox rows hold a versioned envelope `{ v, data }`; the worker hands the job `data`.
      await deliverRealtime(
        (row.payload as { data: { targets: RealtimeTarget[]; event: unknown } }).data,
      );
    }
    if (rows.length > 0) {
      await tx
        .update(outbox)
        .set({ dispatchedAt: sql`now()`, completedAt: sql`now()` })
        .where(
          inArray(
            outbox.id,
            rows.map((r) => r.id),
          ),
        );
    }
    return rows.length;
  });
}
