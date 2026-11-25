import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { CustomerScope, SystemScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import {
  loyaltyPrograms,
  memberships,
  OPEN_REQUEST_STATUSES,
  pointRequests,
  type PointRequestStatus,
  shops,
  shopStaff,
} from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";
import { toVersion } from "./loyalty";

/**
 * Points requests (P1-11, PRODUCT §5). The member's side runs as the customer (RLS: point_requests_own_*);
 * the expiry and reminder jobs run as the worker. Every check-then-act runs after `lockOwnMembershipForRequest`
 * in the same transaction, so two taps or two devices are serialised on the membership row (ENGINEERING §7);
 * the partial unique index on open requests and the unique idempotency key are the database's own backstop.
 */

export type OwnRequest = {
  id: string;
  shopId: string;
  status: PointRequestStatus;
  requestedAt: Date;
};

const ownRequestColumns = {
  id: pointRequests.id,
  shopId: pointRequests.shopId,
  status: pointRequests.status,
  requestedAt: pointRequests.requestedAt,
};

export type RequestMembership = {
  membershipId: string;
  shopStatus: (typeof shops.$inferSelect)["status"];
  versions: ProgrammeVersion[];
};

/**
 * Locks the caller's current membership of `shopId` (FOR UPDATE) and returns it with the shop's status and its
 * programme versions. Null when the caller isn't a current member (never joined, left, or no such shop).
 */
export async function lockOwnMembershipForRequest(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<RequestMembership | null> {
  return withScope(
    scope,
    async (q) => {
      const [row] = await q
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          ownedBy(
            memberships.userId,
            scope,
            eq(memberships.shopId, shopId),
            isNull(memberships.leftAt),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) return null;
      const [shop] = await q
        .select({ status: shops.status })
        .from(shops)
        .innerJoin(memberships, eq(memberships.shopId, shops.id))
        .where(eq(memberships.id, row.id))
        .limit(1);
      if (!shop) return null;
      const versions = await q
        .select()
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.shopId, shopId))
        .orderBy(asc(loyaltyPrograms.version));
      return { membershipId: row.id, shopStatus: shop.status, versions: versions.map(toVersion) };
    },
    tx,
  );
}

/** The caller's own request made with `key`, at any shop (a retried tap), or null. */
export async function findOwnRequestByKey(
  scope: CustomerScope,
  key: string,
  tx: Transaction,
): Promise<OwnRequest | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select(ownRequestColumns)
        .from(pointRequests)
        .where(ownedBy(pointRequests.userId, scope, eq(pointRequests.idempotencyKey, key)))
        .limit(1),
    tx,
  );
  return row ?? null;
}

/** The membership's open request (pending or awaiting_owner), or null. */
export async function findOwnOpenRequest(
  scope: CustomerScope,
  membershipId: string,
  tx: Transaction,
): Promise<OwnRequest | null> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select(ownRequestColumns)
        .from(pointRequests)
        .where(
          ownedBy(
            pointRequests.userId,
            scope,
            eq(pointRequests.membershipId, membershipId),
            inArray(pointRequests.status, [...OPEN_REQUEST_STATUSES]),
          ),
        )
        .limit(1),
    tx,
  );
  return row ?? null;
}

/** How many requests the membership made since `since` (any outcome: the cap counts taps that reached us). */
export async function countOwnRequestsSince(
  scope: CustomerScope,
  membershipId: string,
  since: Date,
  tx: Transaction,
): Promise<number> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({ n: sql<number>`count(*)::int` })
        .from(pointRequests)
        .where(
          ownedBy(
            pointRequests.userId,
            scope,
            eq(pointRequests.membershipId, membershipId),
            gte(pointRequests.requestedAt, since),
          ),
        ),
    tx,
  );
  return row?.n ?? 0;
}

export type InsertOutcome = { kind: "created"; request: OwnRequest } | { kind: "key-taken" };

/**
 * Inserts a new pending request; the database stamps `requested_at` (server receipt time). `key-taken` when
 * the idempotency key already exists (the caller re-reads its own; another account's is a conflict).
 */
export async function insertOwnRequest(
  scope: CustomerScope,
  input: {
    membershipId: string;
    shopId: string;
    idempotencyKey: string;
    clientRequestedAt: Date | null;
  },
  tx: Transaction,
): Promise<InsertOutcome> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .insert(pointRequests)
        .values({
          membershipId: input.membershipId,
          userId: scope.userId,
          shopId: input.shopId,
          idempotencyKey: input.idempotencyKey,
          clientRequestedAt: input.clientRequestedAt,
        })
        .onConflictDoNothing({ target: pointRequests.idempotencyKey })
        .returning(ownRequestColumns),
    tx,
  );
  return row ? { kind: "created", request: row } : { kind: "key-taken" };
}

/** Cancels the membership's open requests (leaving the shop, C-68); returns their ids. */
export async function cancelOwnOpenRequests(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<string[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .update(pointRequests)
        .set({ status: "cancelled", decidedAt: sql`now()` })
        .where(
          ownedBy(
            pointRequests.userId,
            scope,
            eq(pointRequests.shopId, shopId),
            inArray(pointRequests.status, [...OPEN_REQUEST_STATUSES]),
          ),
        )
        .returning({ id: pointRequests.id }),
    tx,
  );
  return rows.map((r) => r.id);
}

/** The caller's open request at `shopId` for the shop page's pending state, or null. */
export async function readOwnOpenRequest(
  scope: CustomerScope,
  shopId: string,
): Promise<OwnRequest | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select(ownRequestColumns)
      .from(pointRequests)
      .where(
        ownedBy(
          pointRequests.userId,
          scope,
          eq(pointRequests.shopId, shopId),
          inArray(pointRequests.status, [...OPEN_REQUEST_STATUSES]),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

// ---- Jobs (worker, BYPASSRLS) ----

export type DueRequest = { id: string; userId: string; shopId: string; requestedAt: Date };

/**
 * Closes up to `limit` open requests whose 24 h ran out by `now` (`awaiting_owner` too, on its original
 * `requested_at`). Rows another worker holds are skipped, so two workers never close one twice; the status
 * change is what makes the customer's notice fire once.
 */
export async function expireDueRequests(
  scope: SystemScope,
  tx: Transaction,
  cutoff: Date,
  limit: number,
): Promise<DueRequest[]> {
  return withScope(
    scope,
    async (q) => {
      const due = await q
        .select({ id: pointRequests.id })
        .from(pointRequests)
        .where(
          and(
            inArray(pointRequests.status, [...OPEN_REQUEST_STATUSES]),
            lte(pointRequests.requestedAt, cutoff),
          ),
        )
        .orderBy(asc(pointRequests.requestedAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) return [];
      return q
        .update(pointRequests)
        .set({ status: "expired", decidedAt: sql`now()` })
        .where(
          inArray(
            pointRequests.id,
            due.map((d) => d.id),
          ),
        )
        .returning({
          id: pointRequests.id,
          userId: pointRequests.userId,
          shopId: pointRequests.shopId,
          requestedAt: pointRequests.requestedAt,
        });
    },
    tx,
  );
}

/**
 * Marks up to `limit` requests still `pending` since before `cutoff` (and requested after `notBefore`, so one
 * about to expire isn't reminded) as reminded, once each; returns them so the shop's team can be told.
 */
export async function remindDueRequests(
  scope: SystemScope,
  tx: Transaction,
  window: { cutoff: Date; notBefore: Date },
  limit: number,
): Promise<DueRequest[]> {
  return withScope(
    scope,
    async (q) => {
      const due = await q
        .select({ id: pointRequests.id })
        .from(pointRequests)
        .where(
          and(
            eq(pointRequests.status, "pending"),
            isNull(pointRequests.remindedAt),
            lte(pointRequests.requestedAt, window.cutoff),
            gte(pointRequests.requestedAt, window.notBefore),
          ),
        )
        .orderBy(asc(pointRequests.requestedAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (due.length === 0) return [];
      return q
        .update(pointRequests)
        .set({ remindedAt: sql`now()` })
        .where(
          inArray(
            pointRequests.id,
            due.map((d) => d.id),
          ),
        )
        .returning({
          id: pointRequests.id,
          userId: pointRequests.userId,
          shopId: pointRequests.shopId,
          requestedAt: pointRequests.requestedAt,
        });
    },
    tx,
  );
}

/** The shop's active team (owners and staff) who see its requests queue. */
export async function activeTeamIds(
  scope: SystemScope,
  tx: Transaction,
  shopId: string,
): Promise<string[]> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .select({ userId: shopStaff.userId })
        .from(shopStaff)
        .where(and(eq(shopStaff.shopId, shopId), eq(shopStaff.active, true)))
        .orderBy(asc(shopStaff.userId))
        .limit(100),
    tx,
  );
  return rows.map((r) => r.userId);
}
