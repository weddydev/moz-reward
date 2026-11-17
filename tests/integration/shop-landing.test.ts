import { randomInt } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { cacheKey, cacheRedis } from "@/server/cache";
import { testOwnerDb as db } from "@/server/db/client";
import { shopClosures, shopHours } from "@/server/db/schema";
import { readShopLanding, type ShopLandingData } from "@/server/repos/shops";
import { checkLandingLimit, LANDING_LIMIT } from "@/server/security/landing-limit";
import { createLimiter } from "@/server/security/rate-limit";
import {
  invalidateShopLanding,
  LANDING_TTL_SEC,
  landingCacheKey,
  loadShopLanding,
} from "@/server/services/shop-landing";
import { makeMembership, makeShop, makeUser } from "@/server/testing/factories";

const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
afterAll(() => {
  down.disconnect();
});

/** A query counter around the real repo read. */
function counted() {
  let reads = 0;
  return {
    read: async (code: string): Promise<ShopLandingData> => {
      reads += 1;
      return readShopLanding(code);
    },
    get reads() {
      return reads;
    },
  };
}

const raw = (code: string) => cacheRedis().get(cacheKey(landingCacheKey(code)));

describe("[P1-02] shop landing data: states", () => {
  it("live for active, expiring, grace and restricted shops, with hours and this week's closures", async () => {
    for (const status of ["active", "expiring", "grace", "restricted"] as const) {
      const shop = await makeShop({ status, tradingName: `Trading ${status}` });
      const data = await readShopLanding(shop.shopCode);
      expect(data.kind).toBe("live");
      if (data.kind === "live") {
        expect(data.shop.status).toBe(status);
        expect(data.shop.name).toBe(`Trading ${status}`);
      }
    }
    const shop = await makeShop({ status: "active" });
    await db()
      .insert(shopHours)
      .values([
        { shopId: shop.id, weekday: 1, opens: "09:00", closes: "17:30" },
        { shopId: shop.id, weekday: 5, opens: "18:00", closes: "02:00" },
      ]);
    await db()
      .insert(shopClosures)
      .values([
        { shopId: shop.id, date: "2001-01-01", note: "long ago" },
        { shopId: shop.id, date: londonDate(2), note: "Refit" },
      ]);
    const data = await readShopLanding(shop.shopCode);
    if (data.kind !== "live") throw new Error("expected live");
    expect(data.hours).toEqual([
      { weekday: 1, opens: "09:00", closes: "17:30" },
      { weekday: 5, opens: "18:00", closes: "02:00" },
    ]);
    expect(data.closures).toEqual([{ date: londonDate(2), note: "Refit" }]);
  });

  it("suspended and closed shops give only their name; pending and unknown are none", async () => {
    const suspended = await makeShop({ status: "suspended", name: "Paused Ltd" });
    const closed = await makeShop({ status: "closed", name: "Gone Ltd" });
    const pending = await makeShop({ status: "pending" });
    expect(await readShopLanding(suspended.shopCode)).toEqual({
      kind: "gone",
      status: "suspended",
      name: "Paused Ltd",
    });
    expect(await readShopLanding(closed.shopCode)).toEqual({
      kind: "gone",
      status: "closed",
      name: "Gone Ltd",
    });
    expect(await readShopLanding(pending.shopCode)).toEqual({ kind: "none" });
    expect(await readShopLanding("ZZZZZZ")).toEqual({ kind: "none" });
  });

  it("an impossible code is none without a cache or database touch; case and spaces are normalised", async () => {
    const c = counted();
    for (const bad of ["", "abc", "0OIL1Z", "<script>", "AAAAAAA", "../../x"]) {
      expect(await loadShopLanding(bad, { read: c.read, redis: down })).toEqual({ kind: "none" });
    }
    expect(c.reads).toBe(0);
    const shop = await makeShop({ status: "active" });
    const data = await loadShopLanding(`  ${shop.shopCode.toLowerCase()} `, { read: c.read });
    expect(data.kind).toBe("live");
    expect(c.reads).toBe(1);
  });
});

describe("[P1-02] shop landing data: redis-cache (60 s)", () => {
  it("a second load within the TTL reads from the cache (no shop query)", async () => {
    const shop = await makeShop({ status: "active" });
    const c = counted();
    const first = await loadShopLanding(shop.shopCode, c);
    await waitForCache(shop.shopCode);
    const second = await loadShopLanding(shop.shopCode, c);
    expect(second).toEqual(first);
    expect(c.reads).toBe(1);
    const ttl = await cacheRedis().ttl(cacheKey(landingCacheKey(shop.shopCode)));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(LANDING_TTL_SEC);
  });

  it("invalidation drops the entry at once: the next load reads the database", async () => {
    const shop = await makeShop({ status: "active" });
    const c = counted();
    await loadShopLanding(shop.shopCode, c);
    await waitForCache(shop.shopCode);
    await invalidateShopLanding(shop.shopCode);
    expect(await raw(shop.shopCode)).toBeNull();
    await loadShopLanding(shop.shopCode, c);
    expect(c.reads).toBe(2);
  });

  it("invalidation with redis-cache down does not throw", async () => {
    await expect(invalidateShopLanding("ABCDEF", down)).resolves.toBeUndefined();
  });

  it("redis-cache down: the page data still comes from the database (public data fails open)", async () => {
    const shop = await makeShop({ status: "active", name: "Open Anyway" });
    const c = counted();
    const data = await loadShopLanding(shop.shopCode, { ...c, redis: down });
    expect(data.kind === "live" && data.shop.name).toBe("Open Anyway");
    expect(c.reads).toBe(1);
  });

  it("a cold-cache burst for one code makes one database read (single flight)", async () => {
    const shop = await makeShop({ status: "active" });
    const c = counted();
    const all = await Promise.all(
      Array.from({ length: 20 }, () => loadShopLanding(shop.shopCode, c)),
    );
    expect(new Set(all.map((d) => JSON.stringify(d))).size).toBe(1);
    expect(c.reads).toBe(1);
  });

  it("the cached value holds no personal data after a member's visit", async () => {
    const user = await makeUser({ email: "member.landing@example.test", name: "Ada Member" });
    const shop = await makeShop({ status: "active" });
    await makeMembership(user.id, shop.id);
    await loadShopLanding(shop.shopCode);
    const value = await waitForCache(shop.shopCode);
    for (const personal of [
      user.id,
      user.email,
      "Ada Member",
      "membership",
      "progress",
      "userId",
    ]) {
      expect(value).not.toContain(personal);
    }
    const parsed = JSON.parse(value) as ShopLandingData;
    expect(Object.keys(parsed).sort()).toEqual(["closures", "hours", "kind", "shop"]);
  });
});

describe("[P1-02] shop lookup rate limit (C-15)", () => {
  const ip = () => `10.${randomInt(255)}.${randomInt(255)}.${randomInt(1, 255)}`;
  const cf = (addr: string, extra: Record<string, string> = {}) =>
    new Headers({ "cf-connecting-ip": addr, ...extra });

  it("the 61st lookup from one IP within a minute is refused with a wait", async () => {
    const addr = ip();
    const now = Date.now();
    for (let i = 0; i < LANDING_LIMIT.max; i++) {
      const r = await checkLandingLimit(cf(addr), { trusted: "cloudflare", now: now + i });
      expect(r?.ok).toBe(true);
    }
    const over = await checkLandingLimit(cf(addr), { trusted: "cloudflare", now: now + 100 });
    expect(over?.ok).toBe(false);
    expect(over?.resetAt.getTime()).toBeGreaterThan(now);
    // Another address is unaffected.
    expect((await checkLandingLimit(cf(ip()), { trusted: "cloudflare" }))?.ok).toBe(true);
  });

  it("keys on the trusted client IP: a spoofed X-Forwarded-For does not open a new bucket", async () => {
    const addr = ip();
    const now = Date.now();
    for (let i = 0; i < LANDING_LIMIT.max; i++) {
      await checkLandingLimit(cf(addr, { "x-forwarded-for": `198.51.100.${i % 250}` }), {
        trusted: "cloudflare",
        now: now + i,
      });
    }
    const over = await checkLandingLimit(cf(addr, { "x-forwarded-for": "198.51.100.251" }), {
      trusted: "cloudflare",
      now: now + 100,
    });
    expect(over?.ok).toBe(false);
  });

  it("no trusted proxy (local/test): no per-IP limit applies", async () => {
    expect(await checkLandingLimit(new Headers(), { trusted: "none" })).toBeNull();
  });

  it("redis-queue down: the lookup limit fails open (public read)", async () => {
    const r = await checkLandingLimit(cf(ip()), {
      trusted: "cloudflare",
      limiter: createLimiter(down),
    });
    expect(r?.ok).toBe(true);
  });
});

describe("[P1-02] every writer of shop landing data invalidates the cache", () => {
  it("files that update or delete shops / shop_hours / shop_closures call invalidateShopLanding", () => {
    const root = join(process.cwd(), "src");
    // Exempt: schema, migrations/seed/reset tooling (demo resets; the 60 s TTL bounds them) and test factories.
    const exempt = [/^server\/db\//, /^server\/testing\//, /\.test\.tsx?$/];
    const writes =
      /\.(update|delete)\(\s*(shops|shopHours|shopClosures)\s*\)|\.insert\(\s*(shopHours|shopClosures)\s*\)|\b(UPDATE|DELETE FROM|INSERT INTO)\s+(shops|shop_hours|shop_closures)\b/;
    const offenders: string[] = [];
    for (const file of walk(root)) {
      const rel = relative(root, file).replaceAll("\\", "/");
      if (exempt.some((re) => re.test(rel))) continue;
      const text = readFileSync(file, "utf8");
      if (writes.test(text) && !text.includes("invalidateShopLanding")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx|sql)$/.test(name)) yield path;
  }
}

/** The cache write is fire-and-forget after the load; wait for it. */
async function waitForCache(code: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const value = await raw(code);
    if (value !== null) return value;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("cache entry never written");
}

function londonDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
}
