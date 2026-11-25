import "server-only";
import { versionActiveAt } from "@/lib/loyalty/programme";
import { londonDayStart } from "@/lib/time";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import type { PointRequestStatus } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { publishRealtime } from "@/server/realtime/publish";
import {
  countOwnRequestsSince,
  findOwnOpenRequest,
  findOwnRequestByKey,
  insertOwnRequest,
  lockOwnMembershipForRequest,
  type OwnRequest,
} from "@/server/repos/point-requests";
import { NOT_A_MEMBER } from "./membership";

/** Requests per customer per shop per UK day (PRODUCT §5, SECURITY §6). */
export const DAILY_REQUEST_CAP = 5;

export const DAILY_CAP_MESSAGE =
  "You've sent 5 requests here today, which is the daily limit. You can ask again tomorrow.";
export const NOT_TAKING_REQUESTS =
  "This shop isn't taking requests right now. Your gold is safe and will be here when it's back.";
export const NO_PROGRAMME_YET =
  "This shop hasn't set up its rewards yet, so there's no gold to collect. Check back soon.";
export const KEY_IN_USE = "That request couldn't be sent. Please try again.";

/** Shop states that take requests: expiring and grace behave as active, restricted still takes them (§15). */
const TAKES_REQUESTS = new Set(["active", "expiring", "grace", "restricted"]);

export type RequestPointsResult = {
  requestId: string;
  status: PointRequestStatus;
  requestedAt: string;
  /** `created`: a new request; `duplicate`: this tap's key was seen before; `open`: one is already waiting. */
  outcome: "created" | "duplicate" | "open";
};

const result = (r: OwnRequest, outcome: RequestPointsResult["outcome"]): RequestPointsResult => ({
  requestId: r.id,
  status: r.status,
  requestedAt: r.requestedAt.toISOString(),
  outcome,
});

/**
 * "Request points" (P1-11, PRODUCT §5). The caller's current membership is locked first, so a double tap, a
 * retried offline send and a second device are serialised (ENGINEERING §7):
 *  1. the same idempotency key again → the first request, unchanged (even past the daily cap);
 *  2. the shop must take requests (§15) and have a programme in force;
 *  3. an open request (pending or awaiting_owner) → that one, no second request;
 *  4. the 6th request in a UK day → a friendly limit;
 *  5. otherwise a new pending request, stamped by the database with its receipt time (`requested_at`); the
 *     phone's clock is stored as advisory only. The shop's queue and the member's other devices get a
 *     `request_created` hint after commit (outbox).
 * `now` decides the UK day of the cap and which programme version is in force; the stamp is always the
 * database's own `now()`.
 */
export async function requestPoints(
  scope: CustomerScope,
  input: { shopId: string; idempotencyKey: string; clientRequestedAt?: Date | null },
  tx: Transaction,
  now: Date = new Date(),
): Promise<RequestPointsResult> {
  const membership = await lockOwnMembershipForRequest(scope, input.shopId, tx);
  if (!membership) throw new AppError("NOT_FOUND", NOT_A_MEMBER);

  const seen = await findOwnRequestByKey(scope, input.idempotencyKey, tx);
  if (seen) {
    if (seen.shopId !== input.shopId) throw new AppError("CONFLICT", KEY_IN_USE);
    return result(seen, "duplicate");
  }
  if (!TAKES_REQUESTS.has(membership.shopStatus))
    throw new AppError("FORBIDDEN", NOT_TAKING_REQUESTS);
  if (!versionActiveAt(membership.versions, now)) throw new AppError("FORBIDDEN", NO_PROGRAMME_YET);

  const open = await findOwnOpenRequest(scope, membership.membershipId, tx);
  if (open) return result(open, "open");

  const today = await countOwnRequestsSince(
    scope,
    membership.membershipId,
    londonDayStart(now),
    tx,
  );
  if (today >= DAILY_REQUEST_CAP) throw new AppError("LIMIT_REACHED", DAILY_CAP_MESSAGE);

  const inserted = await insertOwnRequest(
    scope,
    {
      membershipId: membership.membershipId,
      shopId: input.shopId,
      idempotencyKey: input.idempotencyKey,
      clientRequestedAt: input.clientRequestedAt ?? null,
    },
    tx,
  );
  // Another account's key (a uuid collision or a replayed key): never reveal or reuse its request.
  if (inserted.kind === "key-taken") throw new AppError("CONFLICT", KEY_IN_USE);

  const { request } = inserted;
  await publishRealtime(
    scope,
    tx,
    [
      { kind: "shop", id: input.shopId },
      { kind: "user", id: scope.userId },
    ],
    { type: "request_created", data: { requestId: request.id, shopId: input.shopId } },
  );
  return result(request, "created");
}
