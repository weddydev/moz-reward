import "server-only";
import { and, eq } from "drizzle-orm";
import { publicScope } from "@/server/authz/scope";
import { shops } from "@/server/db/schema";
import { withScope } from "./_base";

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
