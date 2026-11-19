import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import type { CustomerScope } from "@/server/authz/scope";
import { loyaltyPrograms, memberships, shops } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";
import { toVersion } from "./loyalty";

export type OwnVault = {
  shopId: string;
  name: string;
  logoUrl: string | null;
  joinedAt: Date;
  progressGold: number;
  ingotsCompleted: number;
  /** Every programme version of the shop, oldest first. */
  versions: ProgrammeVersion[];
};

/**
 * The customer's own Gold Vault at one shop (P1-08, `/vault/[shopId]`): their current membership's counters,
 * the shop's public identity and its programme versions, in one scoped transaction. Null when the caller
 * isn't a current member (never joined, left, or no such shop), so the page answers the same 404 for all of
 * them. RLS is the second wall: memberships_own, shops_public and loyalty_programs_member_read.
 */
export async function readOwnVault(scope: CustomerScope, shopId: string): Promise<OwnVault | null> {
  return withScope(scope, async (q) => {
    const [row] = await q
      .select({
        shopId: shops.id,
        name: shops.name,
        tradingName: shops.tradingName,
        logoUrl: shops.logoUrl,
        joinedAt: memberships.joinedAt,
        progressGold: memberships.progressGold,
        ingotsCompleted: memberships.ingotsCompleted,
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
      .limit(1);
    if (!row) return null;
    const versions = await q
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.shopId, row.shopId))
      .orderBy(asc(loyaltyPrograms.version));
    const { tradingName, ...rest } = row;
    return { ...rest, name: tradingName ?? row.name, versions: versions.map(toVersion) };
  });
}
