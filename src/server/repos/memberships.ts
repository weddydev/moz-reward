import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { CustomerScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { memberships, shops } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";

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
 * answer (P1-09 adds restoring frozen progress). The DB guard (0020) refuses shops not taking members.
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
      await q
        .update(memberships)
        .set({ leftAt: null, marketingOptIn: input.marketingOptIn })
        .where(eq(memberships.id, existing.id));
      return { kind: "rejoined", membershipId: existing.id };
    },
    tx,
  );
}
