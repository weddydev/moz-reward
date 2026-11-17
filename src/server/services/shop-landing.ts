import "server-only";
import { normaliseCode, SHOP_CODE_LENGTH } from "@/lib/codes";
import { cached, cacheKey, cacheRedis } from "@/server/cache";
import { log } from "@/server/log";
import { readShopLanding, type ShopLandingData } from "@/server/repos/shops";
import type { Redis } from "ioredis";

/**
 * Shop landing data (P1-02, ARCHITECTURE §5 "CSP and caching"): the public profile behind `/s/[code]` is kept
 * in redis-cache for 60 s, keyed by shop code, so a burst of scans costs one database read. HTML is never
 * cached. The cached value is public data only (`ShopLandingData` has no user fields); per-user state is read
 * per request by the page and never written here. Fails open: redis-cache down → read from the database.
 */
export const LANDING_TTL_SEC = 60;

/** Bump when `ShopLandingData` changes shape, so a release never reads the previous release's entries. */
const KEY_VERSION = "v1";
export const landingCacheKey = (shopCode: string): string =>
  `shop-landing:${KEY_VERSION}:${shopCode}`;

/** In-flight loads per code in this process: a cold-cache burst for one code makes one database read. */
const inflight = new Map<string, Promise<ShopLandingData>>();

export type LandingDeps = {
  redis?: Redis;
  /** Injectable for tests (query counter). */
  read?: (shopCode: string) => Promise<ShopLandingData>;
};

/**
 * The landing data for a scanned or typed code. Anything that can't be a shop code is `none` without touching
 * the cache or the database. Unknown codes are cached as `none` too (a burst of one bad code stays cheap).
 */
export async function loadShopLanding(
  input: string,
  deps: LandingDeps = {},
): Promise<ShopLandingData> {
  const shopCode = normaliseCode(input, SHOP_CODE_LENGTH);
  if (!shopCode) return { kind: "none" };
  const running = inflight.get(shopCode);
  if (running) return running;
  const read = deps.read ?? readShopLanding;
  const load = cached(
    landingCacheKey(shopCode),
    LANDING_TTL_SEC,
    () => read(shopCode),
    deps.redis ?? cacheRedis(),
  ).finally(() => inflight.delete(shopCode));
  inflight.set(shopCode, load);
  return load;
}

/**
 * Drops a shop's cached landing data at once. **Every writer of `shops`, `shop_hours` or `shop_closures`
 * calls this after its commit** (profile, hours, closures, status/plan changes); a guard test fails on a
 * writer that doesn't (tests/integration/shop-landing.test.ts). If redis-cache is down the entry can't be
 * dropped, but then nothing new is being cached either and the TTL bounds staleness to 60 s.
 */
export async function invalidateShopLanding(
  shopCode: string,
  redis: Redis = cacheRedis(),
): Promise<void> {
  try {
    await redis.del(cacheKey(landingCacheKey(shopCode)));
  } catch (err) {
    log().warn(
      { err, shopCode },
      "shop landing cache: invalidation failed (TTL bounds it to 60 s)",
    );
  }
}
