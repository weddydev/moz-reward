import "server-only";
import { and, asc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { QuickPick } from "@/lib/requests";
import type { CustomerScope, ShopScope, SystemScope } from "@/server/authz/scope";
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
import { inShop, ownedBy, transaction, withScope } from "./_base";
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

// ---- The shop's queue (P1-12 minimal Requests page; the full page is P2) ----

/** At most this many open requests on the queue (oldest first); also under shop_member_cards' 100-id cap. */
export const TEAM_QUEUE_LIMIT = 50;

/** What the team sees per open request: the member card comes from `shop_member_cards` (0030), ids only else. */
export type TeamRequest = {
  id: string;
  status: "pending" | "awaiting_owner";
  requestedAt: Date;
  /** Set when a staff member's over-limit approval routed it to the owner (the owner sees the proposal). */
  amountPence: number | null;
  items: string[] | null;
  awardGold: number | null;
  /** Null when the person has no card (an erased account, P2-13). */
  member: { name: string; memberId: string } | null;
  purchaseCount: number;
  lastVisitAt: Date | null;
};

/**
 * How many of the shop's requests wait for an owner (`awaiting_owner`, P1-12) inside their 24 h: the count on
 * the owner's Requests nav item (code review M3). RLS (point_requests team read) is the second wall.
 */
export async function countAwaitingOwner(
  scope: ShopScope,
  opts: { requestedAfter: Date },
): Promise<number> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ n: sql<number>`count(*)::int` })
      .from(pointRequests)
      .where(
        inShop(
          pointRequests.shopId,
          scope,
          eq(pointRequests.status, "awaiting_owner"),
          gt(pointRequests.requestedAt, opts.requestedAfter),
        ),
      ),
  );
  return row?.n ?? 0;
}

/**
 * The scoped shop's open requests still inside their 24 h (`requestedAfter` = now − 24 h; the expiry job may
 * not have run yet), oldest first, with each member's name and member ID (staff can't read profiles directly:
 * `shop_member_cards` hands out those two columns for the caller's own members while they are active staff).
 */
export async function listTeamOpenRequests(
  scope: ShopScope,
  opts: { requestedAfter: Date },
): Promise<TeamRequest[]> {
  return transaction(scope, async (tx) => {
    const rows = await withScope(
      scope,
      (q) =>
        q
          .select({
            id: pointRequests.id,
            status: pointRequests.status,
            requestedAt: pointRequests.requestedAt,
            amountPence: pointRequests.amountPence,
            items: pointRequests.items,
            awardGold: pointRequests.awardGold,
            userId: pointRequests.userId,
            purchaseCount: memberships.purchaseCount,
            lastVisitAt: memberships.lastVisitAt,
          })
          .from(pointRequests)
          .innerJoin(memberships, eq(memberships.id, pointRequests.membershipId))
          .where(
            inShop(
              pointRequests.shopId,
              scope,
              inArray(pointRequests.status, [...OPEN_REQUEST_STATUSES]),
              gt(pointRequests.requestedAt, opts.requestedAfter),
            ),
          )
          .orderBy(asc(pointRequests.requestedAt), asc(pointRequests.id))
          .limit(TEAM_QUEUE_LIMIT),
      tx,
    );
    const cards = await memberCards(scope, tx, [...new Set(rows.map((r) => r.userId))]);
    return rows.map(({ userId, status, ...r }) => ({
      ...r,
      status: status as TeamRequest["status"],
      member: cards.get(userId) ?? null,
    }));
  });
}

/** Name and member ID of the scoped shop's own members (0030); ≤ 100 ids (the function raises above). */
export async function memberCards(
  scope: ShopScope,
  tx: Transaction,
  userIds: readonly string[],
): Promise<Map<string, { name: string; memberId: string }>> {
  if (userIds.length === 0) return new Map();
  const rows = await withScope(
    scope,
    (q) =>
      q.execute<{ user_id: string; full_name: string; member_id: string }>(
        sql`SELECT user_id, full_name, member_id FROM public.shop_member_cards(${sql.param([...userIds])}::uuid[])`,
      ),
    tx,
  );
  return new Map([...rows].map((r) => [r.user_id, { name: r.full_name, memberId: r.member_id }]));
}

// ---- The full Requests page (P2-02, PRODUCT §14): four tabs, keyset pages ----

/** The Requests page's tabs (mirrors `REQUEST_TABS` in src/features/requests/tabs.ts). */
export type RequestsTab = "pending" | "awaiting" | "approved" | "expired";

/** One row of a Requests tab: the queue row plus what the approve panel and the decided tabs show. */
export type TeamRequestRow = Omit<TeamRequest, "status"> & {
  status: PointRequestStatus;
  source: "request" | "scan";
  decidedAt: Date | null;
  /** The member's streak now (the approve panel's live gold preview; the server prices again under a lock). */
  streak: { weeks: number; lastWeekStart: string | null };
};

export type TeamRequestsPage = {
  rows: TeamRequestRow[];
  /** The last row's sort time as Postgres prints it (microseconds kept) and id; null on the last page. */
  next: { at: string; id: string } | null;
};

/**
 * Which rows a tab holds at `now` (`dayStart` = the start of today in London) and the column it pages on:
 *  - pending / awaiting: open requests inside their 24 h, newest first (a new request appears at the top);
 *  - approved: approved since the start of today (UK), by decision time (index point_requests_shop_approved_idx);
 *  - expired: `expired`, plus open requests past their 24 h that the 5-minute expiry job hasn't reached yet.
 */
function tabFilter(tab: RequestsTab, opts: { requestedAfter: Date; dayStart: Date }) {
  switch (tab) {
    case "pending":
      return {
        where: and(
          eq(pointRequests.status, "pending"),
          gt(pointRequests.requestedAt, opts.requestedAfter),
        ),
        sortAt: pointRequests.requestedAt,
      };
    case "awaiting":
      return {
        where: and(
          eq(pointRequests.status, "awaiting_owner"),
          gt(pointRequests.requestedAt, opts.requestedAfter),
        ),
        sortAt: pointRequests.requestedAt,
      };
    case "approved":
      return {
        where: and(
          eq(pointRequests.status, "approved"),
          gte(pointRequests.decidedAt, opts.dayStart),
        ),
        sortAt: pointRequests.decidedAt,
      };
    case "expired":
      return {
        where: sql`(${pointRequests.status} = 'expired' OR (${pointRequests.status} IN ('pending', 'awaiting_owner') AND ${pointRequests.requestedAt} <= ${opts.requestedAfter.toISOString()}::timestamptz))`,
        sortAt: pointRequests.requestedAt,
      };
    default: {
      const never: never = tab;
      throw new Error(`unknown tab ${String(never)}`);
    }
  }
}

/**
 * One page of a Requests tab for the scoped shop (owner and staff; RLS point_requests team read is the second
 * wall), newest first, keyset-paged on (sort time, id) so a request arriving between pages never shifts or
 * repeats a row. Member names and IDs come from `shop_member_cards` (0030), ≤ 100 per call.
 */
export async function listTeamRequestsPage(
  scope: ShopScope,
  opts: {
    tab: RequestsTab;
    requestedAfter: Date;
    dayStart: Date;
    before: { at: string; id: string } | null;
    limit: number;
  },
): Promise<TeamRequestsPage> {
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit)), TEAM_QUEUE_LIMIT);
  const { where, sortAt } = tabFilter(opts.tab, opts);
  return transaction(scope, async (tx) => {
    const rows = await withScope(
      scope,
      (q) =>
        q
          .select({
            id: pointRequests.id,
            status: pointRequests.status,
            source: pointRequests.source,
            requestedAt: pointRequests.requestedAt,
            decidedAt: pointRequests.decidedAt,
            amountPence: pointRequests.amountPence,
            items: pointRequests.items,
            awardGold: pointRequests.awardGold,
            userId: pointRequests.userId,
            purchaseCount: memberships.purchaseCount,
            lastVisitAt: memberships.lastVisitAt,
            streakWeeks: memberships.streakWeeks,
            streakLastWeekStart: memberships.streakLastWeekStart,
            sortText: sql<string>`${sortAt}::text`,
          })
          .from(pointRequests)
          .innerJoin(memberships, eq(memberships.id, pointRequests.membershipId))
          .where(
            inShop(
              pointRequests.shopId,
              scope,
              where,
              opts.before
                ? sql`(${sortAt}, ${pointRequests.id}) < (${opts.before.at}::timestamptz, ${opts.before.id}::uuid)`
                : undefined,
            ),
          )
          .orderBy(sql`${sortAt} DESC`, sql`${pointRequests.id} DESC`)
          .limit(limit + 1),
      tx,
    );
    const page = rows.slice(0, limit);
    const cards = await memberCards(scope, tx, [...new Set(page.map((r) => r.userId))]);
    const last = page.at(-1);
    return {
      rows: page.map(({ userId, sortText: _s, streakWeeks, streakLastWeekStart, ...r }) => ({
        ...r,
        streak: { weeks: streakWeeks, lastWeekStart: streakLastWeekStart },
        member: cards.get(userId) ?? null,
      })),
      next: rows.length > limit && last ? { at: last.sortText, id: last.id } : null,
    };
  });
}

/** Badge counts for the Requests tabs (Expired has none): the same filters as `listTeamRequestsPage`. */
export async function countRequestTabs(
  scope: ShopScope,
  opts: { requestedAfter: Date; dayStart: Date },
): Promise<{ pending: number; awaiting: number; approved: number }> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({
        pending: sql<number>`count(*) FILTER (WHERE ${pointRequests.status} = 'pending' AND ${pointRequests.requestedAt} > ${opts.requestedAfter.toISOString()}::timestamptz)::int`,
        awaiting: sql<number>`count(*) FILTER (WHERE ${pointRequests.status} = 'awaiting_owner' AND ${pointRequests.requestedAt} > ${opts.requestedAfter.toISOString()}::timestamptz)::int`,
        approved: sql<number>`count(*) FILTER (WHERE ${pointRequests.status} = 'approved' AND ${pointRequests.decidedAt} >= ${opts.dayStart.toISOString()}::timestamptz)::int`,
      })
      .from(pointRequests)
      .where(
        inShop(
          pointRequests.shopId,
          scope,
          sql`(${pointRequests.requestedAt} > ${opts.requestedAfter.toISOString()}::timestamptz OR ${pointRequests.decidedAt} >= ${opts.dayStart.toISOString()}::timestamptz)`,
        ),
      ),
  );
  return { pending: row?.pending ?? 0, awaiting: row?.awaiting ?? 0, approved: row?.approved ?? 0 };
}

/** The shop's approve-form quick-picks (P2-02; edited in Settings, P2-05). */
export async function readQuickPicks(scope: ShopScope): Promise<QuickPick[]> {
  const [row] = await withScope(scope, (q) =>
    q.select({ quickPicks: shops.quickPicks }).from(shops).where(inShop(shops.id, scope)).limit(1),
  );
  return row?.quickPicks ?? [];
}
