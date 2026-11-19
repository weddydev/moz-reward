import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { normaliseShopCode } from "@/lib/codes";
import { newId } from "@/lib/id";
import { TEMPLATES } from "@/lib/loyalty/programme";
import { mintCustomerScope, publicScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { loyaltyPrograms } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { readShopLanding } from "@/server/repos/shops";
import { readOwnVault } from "@/server/repos/vault";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeUser,
  setShopStatus,
} from "@/server/testing/factories";

/**
 * P1-08: the Gold Vault read (own current membership only) and the landing's reward preview through
 * `shop_reward_preview` (0026): public fields of live shops only, mystery texts blanked inside Postgres.
 */

const NOW = new Date("2026-11-19T10:00:00Z");

const code = (c: string) => {
  const parsed = normaliseShopCode(c);
  if (!parsed) throw new Error(`not a shop code: ${c}`);
  return parsed;
};
const TODAY = "2026-11-19";

describe("[P1-08] Gold Vault read", () => {
  it("returns the caller's own current membership with the shop's programme versions", async () => {
    const [me, shop] = await Promise.all([
      makeUser(),
      makeShop({ status: "active", name: "Brew & Bloom Café", tradingName: "Brew & Bloom" }),
    ]);
    await makeProgramme(shop.id);
    await makeMembership(me.id, shop.id, { progressGold: 720, ingotsCompleted: 2 });
    const vault = await readOwnVault(mintCustomerScope({ userId: me.id }), shop.id);
    expect(vault).toMatchObject({
      shopId: shop.id,
      name: "Brew & Bloom",
      progressGold: 720,
      ingotsCompleted: 2,
    });
    expect(vault?.versions.map((v) => v.version)).toEqual([1]);
  });

  it("is null for a non-member, a left member, another customer's shop and an unknown id", async () => {
    const [me, other, shop, theirs, left] = await Promise.all([
      makeUser(),
      makeUser(),
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
    ]);
    await Promise.all([makeProgramme(shop.id), makeProgramme(theirs.id)]);
    await Promise.all([
      makeMembership(other.id, theirs.id, { progressGold: 500 }),
      makeMembership(me.id, left.id, { leftAt: new Date() }),
    ]);
    const scope = mintCustomerScope({ userId: me.id });
    expect(await readOwnVault(scope, shop.id)).toBeNull();
    expect(await readOwnVault(scope, theirs.id)).toBeNull();
    expect(await readOwnVault(scope, left.id)).toBeNull();
    expect(await readOwnVault(scope, newId())).toBeNull();
  });

  it("a member of a shop without a programme gets the shop and no versions", async () => {
    const [me, shop] = await Promise.all([makeUser(), makeShop({ status: "active" })]);
    await makeMembership(me.id, shop.id);
    const vault = await readOwnVault(mintCustomerScope({ userId: me.id }), shop.id);
    expect(vault?.versions).toEqual([]);
  });
});

describe("[P1-08] landing reward preview (0026, C-50)", () => {
  async function shopWithMystery(status: "active" | "grace" = "active") {
    const shop = await makeShop({ status });
    await db()
      .insert(loyaltyPrograms)
      .values({
        shopId: shop.id,
        version: 1,
        ...TEMPLATES.cafe.rules,
        ingotSize: 1_000,
        mainReward: { text: "Free coffee & cake" },
        milestones: [
          { percent: 25, reward: "Secret brownie", isMystery: true },
          { percent: 50, reward: "Free pastry", isMystery: false },
        ],
        activeFrom: new Date("2026-01-01T00:00:00Z"),
        rewardsFrom: new Date("2026-01-01T00:00:00Z"),
        createdBy: newId(),
      });
    return shop;
  }

  const preview = (shopId: string) =>
    withScope(publicScope("test: landing reward preview"), (q) =>
      q.execute(sql`SELECT * FROM public.shop_reward_preview(${shopId})`),
    );

  it("returns only the public fields, with every mystery reward's text blanked", async () => {
    const shop = await shopWithMystery();
    const rows = [...(await preview(shop.id))];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "active_from",
      "ingot_size",
      "main_reward",
      "milestones",
      "rewards_from",
      "version",
    ]);
    expect(rows[0]?.milestones).toEqual([
      { percent: 25, reward: "", isMystery: true },
      { percent: 50, reward: "Free pastry", isMystery: false },
    ]);
    expect(JSON.stringify(rows)).not.toContain("Secret brownie");
  });

  it("returns nothing for pending, suspended and closed shops, or an unknown id", async () => {
    const shops = await Promise.all([shopWithMystery(), shopWithMystery(), shopWithMystery()]);
    await setShopStatus(shops[0].id, "pending");
    await setShopStatus(shops[1].id, "suspended");
    await setShopStatus(shops[2].id, "closed");
    for (const s of shops) expect([...(await preview(s.id))]).toEqual([]);
    expect([...(await preview(newId()))]).toEqual([]);
    // A grace-period shop is still live on its landing page.
    expect([...(await preview((await shopWithMystery("grace")).id))]).toHaveLength(1);
  });

  it("doesn't open loyalty_programs itself: the public scope still reads no rows", async () => {
    const shop = await shopWithMystery();
    const rows = await withScope(publicScope("test: direct read"), (q) =>
      q
        .select()
        .from(loyaltyPrograms)
        .where(sql`${loyaltyPrograms.shopId} = ${shop.id}`),
    );
    expect(rows).toEqual([]);
  });

  it("the landing read carries the preview: first reward (a mystery) and the full ingot", async () => {
    const shop = await shopWithMystery();
    const data = await readShopLanding(code(shop.shopCode), TODAY, NOW);
    expect(data.kind === "live" && data.reward).toEqual({
      ingotSize: 1_000,
      next: { percent: 25, gold: 250, title: "Mystery reward" },
      main: { text: "Free coffee & cake", gold: 1_000 },
    });
    expect(JSON.stringify(data)).not.toContain("Secret brownie");
  });

  it("a shop without a programme has no preview", async () => {
    const shop = await makeShop({ status: "active" });
    const data = await readShopLanding(code(shop.shopCode), TODAY, NOW);
    expect(data.kind === "live" && data.reward).toBeNull();
  });
});
