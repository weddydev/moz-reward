import "server-only";
import { and, eq } from "drizzle-orm";
import type { CustomerScope } from "@/server/authz/scope";
import { memberships } from "@/server/db/schema";
import { ownedBy, withScope } from "./_base";

/** Whether the caller is a member of `shopId` (P1-02 landing: per request, never cached). */
export async function isOwnMember(scope: CustomerScope, shopId: string): Promise<boolean> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(ownedBy(memberships.userId, scope), eq(memberships.shopId, shopId)))
      .limit(1),
  );
  return Boolean(row);
}
