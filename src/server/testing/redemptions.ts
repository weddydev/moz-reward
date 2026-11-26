import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { testOwnerDb as db } from "@/server/db/client";
import { redemptionCodes } from "@/server/db/schema";

/**
 * P1-16 (E2E only, through the test API): moves a shop's live redeem codes 16 minutes into the past, so they read
 * as expired (the window CHECK keeps created_at + 15 min = expires_at). Returns how many moved.
 */
export async function expireLiveRedeemCodes(shopId: string): Promise<number> {
  const rows = await db()
    .update(redemptionCodes)
    .set({
      createdAt: sql`${redemptionCodes.createdAt} - interval '16 minutes'`,
      expiresAt: sql`${redemptionCodes.expiresAt} - interval '16 minutes'`,
    })
    .where(and(eq(redemptionCodes.shopId, shopId), eq(redemptionCodes.status, "live")))
    .returning({ id: redemptionCodes.id });
  return rows.length;
}
