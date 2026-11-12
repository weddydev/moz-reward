import "server-only";
import { and, eq } from "drizzle-orm";
import { publicScope, type ShopScope } from "@/server/authz/scope";
import { shops } from "@/server/db/schema";
import { inShop, withScope } from "./_base";

const PUBLIC_SHOP_READ = publicScope(
  "public shop identity (name of an active shop, as printed on its QR code and landing page)",
);

/** Name of an active shop by its public code, or null (unknown, pending or suspended shops look the same). */
export async function findActiveShopName(shopCode: string): Promise<string | null> {
  const [row] = await withScope(PUBLIC_SHOP_READ, (q) =>
    q
      .select({ name: shops.name, tradingName: shops.tradingName })
      .from(shops)
      .where(and(eq(shops.shopCode, shopCode), eq(shops.status, "active")))
      .limit(1),
  );
  return row ? (row.tradingName ?? row.name) : null;
}

export type ShopSummary = {
  id: string;
  name: string;
  town: string | null;
  /** The shop's plan state (PRODUCT §14: pending → active → expiring → grace → restricted …). */
  status: (typeof shops.$inferSelect)["status"];
};

/**
 * The shop a shop scope acts on, for the portal shell's shop switcher (P0-12): display name and town. Read
 * under that membership's own scope, so a user only ever sees names of shops they belong to.
 */
export async function shopSummary(scope: ShopScope): Promise<ShopSummary | null> {
  const [row] = await withScope(scope, (q) =>
    q
      .select({
        id: shops.id,
        name: shops.name,
        tradingName: shops.tradingName,
        town: shops.town,
        status: shops.status,
      })
      .from(shops)
      .where(inShop(shops.id, scope))
      .limit(1),
  );
  return row
    ? { id: row.id, name: row.tradingName ?? row.name, town: row.town, status: row.status }
    : null;
}
