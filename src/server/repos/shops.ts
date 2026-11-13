import "server-only";
import { and, eq } from "drizzle-orm";
import { CodeCollisionError, normaliseCode, SHOP_CODE_LENGTH, withUniqueCode } from "@/lib/codes";
import { type AdminScope, publicScope, type ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { shops } from "@/server/db/schema";
import { opsAlert } from "@/server/security/alert";
import { inShop, withScope } from "./_base";

const PUBLIC_SHOP_READ = publicScope(
  "public shop identity (name of an active shop, as printed on its QR code and landing page)",
);

/**
 * Name of an active shop by its public code, or null (unknown, pending or suspended shops look the same).
 * The code is normalised first (case, spaces, a dash); anything that can't be a code returns null without a query.
 */
export async function findActiveShopName(input: string): Promise<string | null> {
  const shopCode = normaliseCode(input, SHOP_CODE_LENGTH);
  if (!shopCode) return null;
  const [row] = await withScope(PUBLIC_SHOP_READ, (q) =>
    q
      .select({ name: shops.name, tradingName: shops.tradingName })
      .from(shops)
      .where(and(eq(shops.shopCode, shopCode), eq(shops.status, "active")))
      .limit(1),
  );
  return row ? (row.tradingName ?? row.name) : null;
}

export type NewShop = Omit<
  typeof shops.$inferInsert,
  "id" | "shopCode" | "createdAt" | "updatedAt"
>;

/**
 * Creates a shop with a fresh 6-character code (P1-01, PRODUCT §3). The unique index decides: a clash retries
 * with a new code inside a savepoint (the caller's transaction survives it), at most 5 times; after that the
 * error is raised to the caller and alerted (`codes.exhausted`), never a duplicate or a shorter code.
 * admin-scope: an audited admin write of one new shop (admin owner/support by RLS), never a read.
 */
export async function createShop(
  scope: AdminScope,
  input: NewShop,
  opts: { tx?: Transaction; /** Tests only: force collisions. */ generate?: () => string } = {},
): Promise<{ id: string; shopCode: string }> {
  return withScope(
    scope,
    async (q) => {
      try {
        return await withUniqueCode(
          (shopCode) =>
            q.transaction(async (sp) => {
              const [row] = await sp
                .insert(shops)
                .values({ ...input, shopCode })
                .returning({ id: shops.id, shopCode: shops.shopCode });
              if (!row) throw new Error("createShop: no row returned");
              return row;
            }),
          { length: SHOP_CODE_LENGTH, generate: opts.generate },
        );
      } catch (err) {
        if (err instanceof CodeCollisionError) {
          opsAlert("codes.exhausted", { kind: "shop_code", attempts: err.attempts });
        }
        throw err;
      }
    },
    opts.tx,
  );
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
