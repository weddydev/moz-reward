import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { memberships, shops } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";
import { forfeitOwnLeftProgress } from "./points-expiry";

/** Whether the caller is a current member of `shopId` (P1-02 landing: per request, never cached). */
export async function isOwnMember(scope: CustomerScope, shopId: string): Promise<boolean> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          ownedBy(memberships.userId, scope),
          eq(memberships.shopId, shopId),
          isNull(memberships.leftAt),
        ),
      )
      .limit(1),
  );
  return Boolean(row);
}

export type OwnMemberShop = {
  shopId: string;
  shopCode: string;
  name: string;
  logoUrl: string | null;
  status: (typeof shops.$inferSelect)["status"];
  joinedAt: Date;
  /** P1-09: "Mute notifications" on the shop page. */
  muted: boolean;
};

/**
 * The shop behind the customer's own current membership (`/shops/[id]`, P1-04): its public identity only. Null
 * when the caller isn't a current member (never joined, left, or no such shop): the page answers 404 for all
 * of these alike, so it never tells a non-member whether a shop id exists.
 */
export async function readOwnMemberShop(
  scope: CustomerScope,
  shopId: string,
): Promise<OwnMemberShop | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({
        shopId: shops.id,
        shopCode: shops.shopCode,
        name: shops.name,
        tradingName: shops.tradingName,
        logoUrl: shops.logoUrl,
        status: shops.status,
        joinedAt: memberships.joinedAt,
        muted: memberships.muted,
      })
      .from(memberships)
      .innerJoin(shops, eq(shops.id, memberships.shopId))
      .where(
        and(
          ownedBy(memberships.userId, scope),
          eq(memberships.shopId, shopId),
          isNull(memberships.leftAt),
        ),
      )
      .limit(1),
  );
  if (!row) return null;
  const { tradingName, ...rest } = row;
  return { ...rest, name: tradingName ?? row.name };
}

export type JoinOutcome =
  /** A new membership: the consent answer must be recorded in the same transaction. */
  | { kind: "joined"; membershipId: string }
  /** A membership the customer had left: re-opened, consent asked again (security design check M6). */
  | { kind: "rejoined"; membershipId: string }
  /** Already a member (re-scan, double tap, parallel call): nothing changed. */
  | { kind: "member"; membershipId: string };

/**
 * Joins the caller to `shopId` at most once (unique user+shop). `ON CONFLICT DO NOTHING` makes parallel calls
 * safe: the loser re-selects the winner's row and changes nothing. A left membership is re-opened with the new
 * answer; re-opening the same row is what restores the frozen progress (P1-09: leaving never touches the
 * counters, and nothing is paid on a rejoin) through London day 30 after the leave; from day 31 it is forfeit
 * first (P1-13, C-73). The DB guards (0020, 0021) refuse shops not taking members.
 */
export async function joinOwnMembership(
  scope: CustomerScope,
  input: { shopId: string; marketingOptIn: boolean },
  tx: Transaction,
): Promise<JoinOutcome> {
  return withScope(
    scope,
    async (q) => {
      const [created] = await q
        .insert(memberships)
        .values({
          userId: scope.userId,
          shopId: input.shopId,
          marketingOptIn: input.marketingOptIn,
        })
        .onConflictDoNothing({ target: [memberships.userId, memberships.shopId] })
        .returning({ id: memberships.id });
      if (created) return { kind: "joined", membershipId: created.id };
      const [existing] = await q
        .select({ id: memberships.id, leftAt: memberships.leftAt })
        .from(memberships)
        .where(and(ownedBy(memberships.userId, scope), eq(memberships.shopId, input.shopId)))
        .limit(1)
        .for("update");
      if (!existing) throw new Error("joinOwnMembership: conflict without a row");
      if (!existing.leftAt) return { kind: "member", membershipId: existing.id };
      // C-73 (P1-13): past the 30-day window the frozen progress is forfeit before the row re-opens, even if
      // the daily job hasn't run yet (the database decides the window; nothing happens inside it).
      await forfeitOwnLeftProgress(q, existing.id);
      await q
        .update(memberships)
        .set({ leftAt: null, marketingOptIn: input.marketingOptIn })
        .where(eq(memberships.id, existing.id));
      return { kind: "rejoined", membershipId: existing.id };
    },
    tx,
  );
}

/**
 * Locks the caller's current membership of `shopId` (FOR UPDATE) without changing it; false when there is none.
 * "Leave shop" takes it first, so a points request being sent at the same moment either commits before the
 * leave (and is cancelled by it) or waits and then finds the membership closed (P1-11, C-68).
 */
export async function lockOwnCurrentMembership(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<boolean> {
  const [row] = await withScope(
    scope,
    (q) =>
      q
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
        .for("update"),
    tx,
  );
  return Boolean(row);
}

export type LeaveOutcome =
  /** Left now. `withdrewMarketing`: the member had opted in, so a 'leave' consent row must follow (C-54). */
  | { kind: "left"; membershipId: string; withdrewMarketing: boolean; shopName: string }
  /** Already left (a second tap, or a parallel call that lost the row lock): nothing changed. */
  | { kind: "already-left" }
  /** Never joined, or no such shop: nothing to leave. */
  | { kind: "not-member" };

/**
 * "Leave shop" on the caller's own membership (P1-09, PRODUCT §4): `left_at` now and marketing withdrawn, in
 * the caller's transaction. Only these columns change, so the ledger and the progress counters stay as they
 * are (frozen) and a rejoin re-opens them. The row is locked first, so two parallel leaves leave once. Allowed
 * in any shop status (0021). The caller records the consent change in the same transaction (the deferred
 * consent trigger in 0020 refuses the commit otherwise).
 */
export async function leaveOwnMembership(
  scope: CustomerScope,
  shopId: string,
  tx: Transaction,
): Promise<LeaveOutcome> {
  return withScope(
    scope,
    async (q) => {
      const [row] = await q
        .select({
          id: memberships.id,
          leftAt: memberships.leftAt,
          marketingOptIn: memberships.marketingOptIn,
        })
        .from(memberships)
        .where(and(ownedBy(memberships.userId, scope), eq(memberships.shopId, shopId)))
        .limit(1)
        .for("update");
      if (!row) return { kind: "not-member" };
      if (row.leftAt) return { kind: "already-left" };
      const withdrewMarketing = row.marketingOptIn === true;
      await q
        .update(memberships)
        .set({
          leftAt: sql`now()`,
          // "Not asked" (null) can't be written back (0020); false stays false.
          ...(withdrewMarketing ? { marketingOptIn: false } : {}),
        })
        .where(eq(memberships.id, row.id));
      // The consent row hashes the question as the member saw it, which names the shop (shops_public: a
      // membership's shop is never pending).
      const [shop] = await q
        .select({ name: shops.name, tradingName: shops.tradingName })
        .from(shops)
        .innerJoin(memberships, eq(memberships.shopId, shops.id))
        .where(eq(memberships.id, row.id))
        .limit(1);
      return {
        kind: "left",
        membershipId: row.id,
        withdrewMarketing,
        shopName: shop?.tradingName ?? shop?.name ?? "",
      };
    },
    tx,
  );
}

/**
 * "Mute notifications" on the caller's own current membership (P1-09): takes effect at once (every sender
 * reads `muted` at send time). False when the caller isn't a current member (never joined, or left).
 */
export async function setOwnMembershipMuted(
  scope: CustomerScope,
  shopId: string,
  muted: boolean,
  tx: Transaction,
): Promise<boolean> {
  const rows = await withScope(
    scope,
    (q) =>
      q
        .update(memberships)
        .set({ muted })
        .where(
          and(
            ownedBy(memberships.userId, scope),
            eq(memberships.shopId, shopId),
            isNull(memberships.leftAt),
          ),
        )
        .returning({ id: memberships.id }),
    tx,
  );
  return rows.length > 0;
}
