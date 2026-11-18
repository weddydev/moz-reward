import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { CodeCollisionError, normaliseCode, SHOP_CODE_LENGTH, withUniqueCode } from "@/lib/codes";
import type { LngLat } from "@/lib/geo";
import { addDays } from "@/lib/time";
import {
  type AdminScope,
  type CustomerScope,
  publicScope,
  type ShopScope,
} from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { shopClosures, shopHours, shops } from "@/server/db/schema";
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

/** Shop statuses whose landing page works normally (PRODUCT §14: a restricted plan still shows its landing). */
export const LANDING_LIVE_STATUSES = ["active", "expiring", "grace", "restricted"] as const;
type LandingLiveStatus = (typeof LANDING_LIVE_STATUSES)[number];

/** The public profile behind `/s/[code]` (P1-02). Public data only: nothing about any user. */
export type ShopLandingData =
  | { kind: "none" }
  | { kind: "gone"; status: "suspended" | "closed"; name: string }
  | {
      kind: "live";
      shop: {
        id: string;
        shopCode: string;
        name: string;
        category: string;
        description: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        town: string | null;
        postcode: string | null;
        location: LngLat | null;
        googlePlaceId: string | null;
        phone: string | null;
        logoUrl: string | null;
        coverUrl: string | null;
        status: LandingLiveStatus;
      };
      hours: { weekday: number; opens: string; closes: string }[];
      /** Closures from yesterday (London date) for 9 days: enough for today, overnight and this week. */
      closures: { date: string; note: string | null }[];
    };

const PUBLIC_LANDING_READ = publicScope(
  "public shop landing page (profile, hours and closures of a shop, as printed on its QR code)",
);

/**
 * Reads a shop's public landing data by an already-normalised code (`normaliseCode`). Pending and unknown
 * shops are `none` (RLS hides pending shops from the public too); suspended and closed shops return only
 * their name. Callers go through `loadShopLanding` (src/server/services/shop-landing.ts), which caches this.
 */
export async function readShopLanding(
  shopCode: string,
  /** Today in London (YYYY-MM-DD, `londonDate`): the closures window is built around it, never the DB clock. */
  today: string,
): Promise<ShopLandingData> {
  return withScope(PUBLIC_LANDING_READ, async (q) => {
    const [row] = await q
      .select({
        id: shops.id,
        shopCode: shops.shopCode,
        name: shops.name,
        tradingName: shops.tradingName,
        category: shops.category,
        description: shops.description,
        addressLine1: shops.addressLine1,
        addressLine2: shops.addressLine2,
        town: shops.town,
        postcode: shops.postcode,
        location: shops.location,
        googlePlaceId: shops.googlePlaceId,
        phone: shops.phone,
        logoUrl: shops.logoUrl,
        coverUrl: shops.coverUrl,
        status: shops.status,
      })
      .from(shops)
      .where(eq(shops.shopCode, shopCode))
      .limit(1);
    if (!row || row.status === "pending") return { kind: "none" };
    const name = row.tradingName ?? row.name;
    if (row.status === "suspended" || row.status === "closed") {
      return { kind: "gone", status: row.status, name };
    }
    const { tradingName: _t, ...shop } = row;
    const [hours, closures] = await Promise.all([
      q
        .select({ weekday: shopHours.weekday, opens: shopHours.opens, closes: shopHours.closes })
        .from(shopHours)
        .where(eq(shopHours.shopId, row.id))
        .orderBy(asc(shopHours.weekday), asc(shopHours.opens)),
      q
        .select({ date: shopClosures.date, note: shopClosures.note })
        .from(shopClosures)
        .where(
          and(
            eq(shopClosures.shopId, row.id),
            gte(shopClosures.date, addDays(today, -1)),
            lt(shopClosures.date, addDays(today, 8)),
          ),
        )
        .orderBy(asc(shopClosures.date)),
    ]);
    return {
      kind: "live",
      shop: { ...shop, name, status: row.status },
      hours: hours.map((h) => ({ ...h, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })),
      closures,
    };
  });
}

const JOINABLE = new Set(["active", "expiring", "grace", "restricted"]);

/**
 * The shop a customer is joining, by code (P1-04). A plain read under the customer's own scope: `FOR SHARE`
 * would need an UPDATE policy the customer doesn't have (RLS), and the membership's FK already takes a key-share
 * lock on the shop row. The memberships guard (0020) re-checks the status at insert, as the database wall.
 */
export async function findJoinableShop(
  scope: CustomerScope,
  shopCode: string,
  tx: Transaction,
): Promise<{ kind: "live"; id: string; name: string } | { kind: "gone" } | { kind: "none" }> {
  const code = normaliseCode(shopCode, SHOP_CODE_LENGTH);
  if (!code) return { kind: "none" };
  const [row] = await withScope(
    scope,
    (q) =>
      q
        .select({
          id: shops.id,
          name: shops.name,
          tradingName: shops.tradingName,
          status: shops.status,
        })
        .from(shops)
        .where(eq(shops.shopCode, code))
        .limit(1),
    tx,
  );
  if (!row || row.status === "pending") return { kind: "none" };
  if (!JOINABLE.has(row.status)) return { kind: "gone" };
  return { kind: "live", id: row.id, name: row.tradingName ?? row.name };
}
