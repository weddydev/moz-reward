import "server-only";
import { REQUEST_TTL_MS } from "@/lib/requests";
import type { SystemScope } from "@/server/authz/scope";
import { notify } from "@/server/notifications/notify";
import { publishRealtime } from "@/server/realtime/publish";
import { transaction } from "@/server/repos/_base";
import { activeTeamIds, expireDueRequests, remindDueRequests } from "@/server/repos/point-requests";

/** An open request expires this long after `requested_at` (PRODUCT §5), `awaiting_owner` included. */

export { REQUEST_TTL_MS };
/** The shop is reminded once when a request has been pending this long (PRODUCT §19). */
export const REMIND_AFTER_MS = 30 * 60 * 1000;
/** Requests closed (or reminded) per transaction, and transactions per run (bounds one run's work). */
export const JOB_BATCH = 100;
export const JOB_MAX_BATCHES = 50;

/**
 * Every 5 min (P1-11): closes open requests 24 h after `requested_at` and tells the customer in-app through the
 * dispatch interface (P1-10), plus a `request_decided` hint to the shop's queue and the member's devices. The
 * status change happens once (row lock, SKIP LOCKED for a second worker), and the notice's id is derived from
 * the request, so a retried job never sends it twice. `now` is injected (ENGINEERING §8).
 */
export async function expirePointRequests(
  scope: SystemScope,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const cutoff = new Date(now.getTime() - REQUEST_TTL_MS);
  let expired = 0;
  for (let batch = 0; batch < JOB_MAX_BATCHES; batch++) {
    const n = await transaction(scope, async (tx) => {
      const rows = await expireDueRequests(scope, tx, cutoff, JOB_BATCH);
      for (const r of rows) {
        const payload = {
          shopId: r.shopId,
          requestId: r.id,
          requestedAt: r.requestedAt.toISOString(),
        };
        await notify(scope, tx, [r.userId], {
          type: "request_expired",
          shopId: r.shopId,
          payload,
          dedupe: {
            key: `request-expired:${r.id}`,
            createdAt: new Date(r.requestedAt.getTime() + REQUEST_TTL_MS),
          },
        });
        await publishRealtime(
          scope,
          tx,
          [
            { kind: "shop", id: r.shopId },
            { kind: "user", id: r.userId },
          ],
          {
            type: "request_decided",
            data: { requestId: r.id, shopId: r.shopId, outcome: "expired" },
          },
        );
      }
      return rows.length;
    });
    expired += n;
    if (n < JOB_BATCH) break;
  }
  return { expired };
}

/**
 * Every 5 min (P1-11): a request still `pending` after 30 min gets one reminder to the shop's active team
 * (in-app; push arrives with P3-07). `reminded_at` makes it once per request; `awaiting_owner` requests already
 * notified the owners when they were routed (P1-12), so only `pending` ones are reminded.
 */
export async function remindPointRequests(
  scope: SystemScope,
  now: Date = new Date(),
): Promise<{ reminded: number }> {
  const window = {
    cutoff: new Date(now.getTime() - REMIND_AFTER_MS),
    notBefore: new Date(now.getTime() - REQUEST_TTL_MS),
  };
  let reminded = 0;
  for (let batch = 0; batch < JOB_MAX_BATCHES; batch++) {
    const n = await transaction(scope, async (tx) => {
      const rows = await remindDueRequests(scope, tx, window, JOB_BATCH);
      const teams = new Map<string, string[]>();
      for (const r of rows) {
        const team = teams.get(r.shopId) ?? (await activeTeamIds(scope, tx, r.shopId));
        teams.set(r.shopId, team);
        await notify(scope, tx, team, {
          type: "request_reminder",
          shopId: r.shopId,
          payload: { shopId: r.shopId, requestId: r.id, requestedAt: r.requestedAt.toISOString() },
          dedupe: {
            key: `request-reminder:${r.id}`,
            createdAt: new Date(r.requestedAt.getTime() + REMIND_AFTER_MS),
          },
        });
      }
      return rows.length;
    });
    reminded += n;
    if (n < JOB_BATCH) break;
  }
  return { reminded };
}
