import { and, desc, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { saveLoyaltyProgramme } from "@/features/loyalty/actions";
import { TEMPLATES } from "@/lib/loyalty/programme";
import { runAsPrincipal } from "@/server/authz/principal";
import { cacheKey, cacheRedis } from "@/server/cache";
import { testOwnerDb as db } from "@/server/db/client";
import { auditLogs, loyaltyPrograms, shops } from "@/server/db/schema";
import { landingCacheKey, loadShopLanding } from "@/server/services/shop-landing";
import { authzMatrix, world } from "./harness";

/** The latest version of a shop's programme (0 = none), so each run saves on top of whatever is there. */
async function latestVersion(shopId: string): Promise<number> {
  const [row] = await db()
    .select({ version: loyaltyPrograms.version })
    .from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.shopId, shopId))
    .orderBy(desc(loyaltyPrograms.version))
    .limit(1);
  return row?.version ?? 0;
}

let rate = 100;

// Loyalty programme settings (P1-05): the shop's owner only (with TOTP); staff, other shops, customers and
// admins are refused. Each run changes the earn rate so it really saves a version.
authzMatrix("saveLoyaltyProgramme", {
  allow: ["owner_own_shop"],
  run: async (w) => {
    rate += 1;
    return saveLoyaltyProgramme({
      shopId: w.shopA.id,
      baseVersion: await latestVersion(w.shopA.id),
      rules: { ...TEMPLATES.cafe.rules, earnRate: rate },
    });
  },
});

it("[P1-05] saveLoyaltyProgramme writes the version and its audit row in one go", async () => {
  const w = await world();
  const base = await latestVersion(w.shopA.id);
  const res = await runAsPrincipal(w.principals.owner_own_shop, () =>
    saveLoyaltyProgramme({
      shopId: w.shopA.id,
      baseVersion: base,
      rules: { ...TEMPLATES.restaurant.rules },
    }),
  );
  expect(res.ok && res.data.kind).toBe("saved");
  const audits = await db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.action, "loyalty_programme.save"), eq(auditLogs.entityId, w.shopA.id)));
  expect(audits.some((a) => (a.meta as { version?: number }).version === base + 1)).toBe(true);
});

it("[P1-05] saveLoyaltyProgramme returns field errors for bad input", async () => {
  const w = await world();
  const baseVersion = await latestVersion(w.shopA.id);
  const res = await runAsPrincipal(w.principals.owner_own_shop, () =>
    saveLoyaltyProgramme({
      shopId: w.shopA.id,
      baseVersion,
      rules: { ...TEMPLATES.cafe.rules, ingotSize: 5, mainReward: { text: "" } },
    }),
  );
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error.code).toBe("VALIDATION");
    expect(Object.keys(res.error.fieldErrors ?? {})).toEqual(
      expect.arrayContaining(["rules.ingotSize", "rules.mainReward.text"]),
    );
  }
});

it("[P1-08] a saved programme drops the shop's cached landing page, so the reward preview is current (C-50)", async () => {
  const w = await world();
  const [shop] = await db()
    .select({ shopCode: shops.shopCode })
    .from(shops)
    .where(eq(shops.id, w.shopA.id));
  if (!shop) throw new Error("no shop");
  const size = 2_000 + (Date.now() % 50_000);
  await loadShopLanding(shop.shopCode); // primes the 60 s cache
  const key = cacheKey(landingCacheKey(shop.shopCode));
  expect(await cacheRedis().exists(key)).toBe(1);
  const res = await runAsPrincipal(w.principals.owner_own_shop, async () =>
    saveLoyaltyProgramme({
      shopId: w.shopA.id,
      baseVersion: await latestVersion(w.shopA.id),
      // The ingot size applies at once (a reward change waits 14 days' notice, so the preview keeps the old one).
      rules: { ...TEMPLATES.cafe.rules, ingotSize: size },
    }),
  );
  expect(res.ok && res.data.kind).toBe("saved");
  expect(await cacheRedis().exists(key)).toBe(0);
  const fresh = await loadShopLanding(shop.shopCode);
  expect(fresh.kind === "live" && fresh.reward?.ingotSize).toBe(size);
});
