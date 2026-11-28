import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { ShopId } from "@/lib/brand";
import { generateShopCode } from "@/lib/codes";
import { mintAdminScope, mintShopScope, type Scope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { shops } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { makeAdmin, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P1-A close (security review SEC-M2): `shops_own_update` lets a shop's whole team update its shop row, so a
 * BEFORE UPDATE guard (drizzle/0023) decides the columns: the shop owner edits the Settings fields (PRODUCT §14,
 * VAT details included), staff edit nothing, and status, shop code and slug are the admins' (owner/support,
 * `shops_admin_write`).
 */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

const DENIED = "42501";

/** Every shops column, by who may write it. A new column fails this test until it is classified here (and, if
 *  the shop owner may change it, added to `owner_writable` in the trigger). */
const CLASSIFIED = {
  // closed_at (P1-16): stamped by the shops_closed_at trigger from status; a value the web role sends is replaced.
  // quick_picks (P2-02): admin-only until P2-05 ships the owner's editor and adds it to owner_writable (FOLLOWUPS).
  adminOnly: ["id", "slug", "shop_code", "status", "created_at", "closed_at", "quick_picks"],
  ownerWritable: [
    "name",
    "trading_name",
    "category",
    "description",
    "address_line1",
    "address_line2",
    "town",
    "postcode",
    "location",
    "google_place_id",
    "phone",
    "logo_url",
    "cover_url",
    "vat_number",
  ],
  dbMaintained: ["updated_at"],
} as const;

type ShopSet = Partial<typeof shops.$inferInsert>;

const update = (scope: Scope, id: ShopId, set: ShopSet) =>
  withScope(scope, (q) =>
    q.update(shops).set(set).where(eq(shops.id, id)).returning({ id: shops.id }),
  );

async function team() {
  const [shop, owner, staffer] = await Promise.all([
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shop.id, owner.id, "owner"),
    makeStaff(shop.id, staffer.id, "staff"),
  ]);
  return {
    shop,
    owner: mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: staffer.id, shopId: shop.id, role: "staff" }),
  };
}

const ADMIN_ONLY_SETS: ShopSet[] = [
  { status: "suspended" },
  { shopCode: generateShopCode() },
  { slug: "taken-over" },
  { createdAt: new Date("2020-01-01T00:00:00Z") },
  { name: "Renamed", status: "closed" },
];

describe("[P1-02] shops: who may change which column (P1-A close, security review SEC-M2)", () => {
  it("classifies every shops column (catalog)", async () => {
    const rows = await db().execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'shops' ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(Object.values(CLASSIFIED).flat().sort());
  });

  it("lets the shop owner edit the Settings fields, VAT details included", async () => {
    const t = await team();
    const set = {
      name: "Brew & Bake",
      tradingName: "Brew and Bake Ltd",
      description: "Coffee and pastries.",
      town: "Leeds",
      postcode: "LS1 4AP",
      phone: "+441132000000",
      logoUrl: "https://cdn.example/logo.webp",
      coverUrl: "https://cdn.example/cover.webp",
      vatNumber: "GB123456789",
    } satisfies ShopSet;
    expect(await update(t.owner, t.shop.id, set)).toHaveLength(1);
    const [row] = await db().select().from(shops).where(eq(shops.id, t.shop.id));
    expect(row).toMatchObject(set);
  });

  it("refuses the shop owner changing status, shop code, slug or created_at", async () => {
    const t = await team();
    for (const set of ADMIN_ONLY_SETS) {
      expect(await pgCode(() => update(t.owner, t.shop.id, set)), JSON.stringify(set)).toBe(DENIED);
    }
    const [row] = await db().select().from(shops).where(eq(shops.id, t.shop.id));
    expect(row).toMatchObject({ status: "active", shopCode: t.shop.shopCode, slug: t.shop.slug });
  });

  it("refuses staff changing any column of their shop", async () => {
    const t = await team();
    for (const set of [
      ...ADMIN_ONLY_SETS,
      { name: "Staff Rename" },
      { logoUrl: "https://evil.example/x.png" },
      { vatNumber: "GB000000000" },
    ] satisfies ShopSet[]) {
      expect(await pgCode(() => update(t.staff, t.shop.id, set)), JSON.stringify(set)).toBe(DENIED);
    }
    const [row] = await db().select().from(shops).where(eq(shops.id, t.shop.id));
    expect(row).toMatchObject({ name: t.shop.name, logoUrl: t.shop.logoUrl });
  });

  it("refuses an owner of another shop (RLS), and leaves admin owner/support free", async () => {
    const [t, other] = await Promise.all([team(), team()]);
    expect(await update(other.owner, t.shop.id, { name: "Hijack" })).toHaveLength(0);
    for (const role of ["owner", "support"] as const) {
      const user = await makeUser();
      await makeAdmin(user.id, role);
      const admin = mintAdminScope({ userId: user.id, role });
      expect(
        await update(admin, t.shop.id, { status: "suspended", name: `By ${role}` }),
      ).toHaveLength(1);
      expect(await update(admin, t.shop.id, { status: "active" })).toHaveLength(1);
    }
  });
});
