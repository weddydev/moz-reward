import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { joinShopAction } from "@/features/join/actions";
import {
  BIRTHDAY_INVALID,
  OVER_13_REQUIRED,
  TOO_MANY_NEW_SHOPS,
  UK_MOBILE_ONLY,
} from "@/features/join/profile-input";
import { normaliseShopCode } from "@/lib/codes";
import { MARKETING_CONSENT_VERSION } from "@/lib/marketing-consent";
import { loadPrincipal, runAsPrincipal } from "@/server/authz/principal";
import { testOwnerDb as db } from "@/server/db/client";
import {
  auditLogs,
  customerProfiles,
  marketingConsents,
  memberships,
  shops,
} from "@/server/db/schema";
import type * as RateLimitModule from "@/server/security/rate-limit";
import { limit, userKey } from "@/server/security/rate-limit";
import { CONSENT_OUTDATED, PROFILE_REQUIRED, SHOP_NOT_JOINABLE } from "@/server/services/join";
import { invalidateShopLanding, loadShopLanding } from "@/server/services/shop-landing";
import { makeShop, makeUser } from "@/server/testing/factories";

/**
 * P1-04 step C: the join sheet's server action (`join.shop`) on top of `joinShop`: input cleaning (name NFC,
 * no hidden characters; UK mobiles only; real birthdays; 13+), the two fail-closed limits, the audit row,
 * and what a refusal leaves behind (nothing).
 */
const faults = vi.hoisted(() => ({ redisDown: null as Redis | null }));
// Outside a Next request there is no cache store to purge; the spy records what the action asks for.
const nextCache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => nextCache);
vi.mock("@/server/security/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof RateLimitModule>();
  return {
    ...actual,
    limitOrThrow: (opts: Parameters<typeof actual.limitOrThrow>[0]) =>
      actual.limitOrThrow(
        opts,
        faults.redisDown ? actual.createLimiter(faults.redisDown) : undefined,
      ),
  };
});
const down = new Redis("redis://127.0.0.1:1", {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
afterEach(() => {
  faults.redisDown = null;
  nextCache.revalidatePath.mockClear();
});
afterAll(() => {
  down.disconnect();
});

async function customer() {
  const user = await makeUser();
  const principal = await loadPrincipal({
    userId: user.id,
    mfaVerified: false,
    sessionCreatedAt: new Date(),
  });
  return { id: user.id, principal };
}
type Customer = Awaited<ReturnType<typeof customer>>;

type Profile = {
  fullName: string;
  phone: string;
  birthdayDay: number | null;
  birthdayMonth: number | null;
  over13: boolean;
};
const PROFILE: Profile = {
  fullName: "  Aisha   Khan ",
  phone: "07400 123456",
  birthdayDay: 14,
  birthdayMonth: 3,
  over13: true,
};

/** The name the sheet would show: the shop's current display name (unknown codes: a placeholder). */
async function shownName(input: string): Promise<string> {
  const shopCode = normaliseShopCode(input);
  if (!shopCode) return "Unknown shop";
  const [row] = await db()
    .select({ name: shops.name, tradingName: shops.tradingName })
    .from(shops)
    .where(eq(shops.shopCode, shopCode));
  return row ? (row.tradingName ?? row.name) : "Unknown shop";
}

const call = (
  c: Customer,
  shopCode: string,
  over: {
    marketingOptIn?: boolean;
    consentVersion?: string;
    consentShopName?: string;
    profile?: Partial<Profile> | null;
  } = {},
) =>
  runAsPrincipal(c.principal, async () =>
    joinShopAction({
      shopCode,
      marketingOptIn: over.marketingOptIn ?? false,
      consentVersion: over.consentVersion ?? MARKETING_CONSENT_VERSION,
      consentShopName: over.consentShopName ?? (await shownName(shopCode)),
      profile: over.profile === null ? null : { ...PROFILE, ...over.profile },
    }),
  );

const rowsFor = async (userId: string) => ({
  profiles: await db().select().from(customerProfiles).where(eq(customerProfiles.userId, userId)),
  memberships: await db().select().from(memberships).where(eq(memberships.userId, userId)),
  consents: await db().select().from(marketingConsents).where(eq(marketingConsents.userId, userId)),
  audits: await db()
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.actorId, userId), eq(auditLogs.action, "membership.join"))),
});

const nothingWritten = { profiles: [], memberships: [], consents: [], audits: [] };

describe("[P1-04] join.shop action", () => {
  it("purges the cached landing pages after a join commits, so back shows the member landing (P1-A QA-MAJ1)", async () => {
    const c = await customer();
    const shop = await makeShop();
    expect(await call(c, shop.shopCode)).toMatchObject({ ok: true });
    expect(nextCache.revalidatePath).toHaveBeenCalledExactlyOnceWith("/s/[code]", "page");

    nextCache.revalidatePath.mockClear();
    const closed = await makeShop({ status: "suspended" });
    expect(await call(c, closed.shopCode, { profile: null })).toMatchObject({ ok: false });
    expect(nextCache.revalidatePath).not.toHaveBeenCalled();
  });

  it("first join: cleaned profile, membership, consent row and one audit row; a re-scan changes nothing", async () => {
    const c = await customer();
    const shop = await makeShop();

    const first = await call(c, shop.shopCode, { marketingOptIn: true });
    expect(first).toMatchObject({ ok: true, data: { shopId: shop.id, firstJoin: true } });
    const after = await rowsFor(c.id);
    expect(after.profiles).toHaveLength(1);
    expect(after.profiles[0]).toMatchObject({
      fullName: "Aisha Khan",
      birthdayDay: 14,
      birthdayMonth: 3,
    });
    expect(after.profiles[0]?.ageDeclaredAt).toBeInstanceOf(Date);
    expect(after.memberships).toMatchObject([{ shopId: shop.id, marketingOptIn: true }]);
    expect(after.consents).toMatchObject([{ optedIn: true, source: "join" }]);
    expect(after.audits).toMatchObject([
      {
        entity: "membership",
        entityId: after.memberships[0]?.id,
        meta: { shopId: shop.id, marketingOptIn: true },
      },
    ]);
    // Exactly these keys: no name or phone number, plain or sealed, in the audit row.
    expect(after.audits[0]?.meta).toEqual({ shopId: shop.id, marketingOptIn: true });

    const again = await call(c, shop.shopCode, { marketingOptIn: false, profile: null });
    expect(again).toMatchObject({ ok: true, data: { shopId: shop.id, firstJoin: false } });
    const later = await rowsFor(c.id);
    expect(later.memberships).toMatchObject([{ marketingOptIn: true }]);
    expect(later.consents).toHaveLength(1);
    expect(later.audits).toHaveLength(1);
  });

  it("a second shop needs no profile; a profile sent anyway never overwrites the stored one", async () => {
    const c = await customer();
    await call(c, (await makeShop()).shopCode);
    const res = await call(c, (await makeShop()).shopCode, {
      profile: { fullName: "Someone Else", phone: "07400 654321" },
    });
    expect(res).toMatchObject({ ok: true, data: { firstJoin: true } });
    const rows = await rowsFor(c.id);
    expect(rows.profiles).toMatchObject([{ fullName: "Aisha Khan" }]);
    expect(rows.memberships).toHaveLength(2);
  });

  it("first join without a profile is refused and writes nothing", async () => {
    const c = await customer();
    const res = await call(c, (await makeShop()).shopCode, { profile: null });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: PROFILE_REQUIRED },
    });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
  });

  it.each([
    ["an international number", { phone: "+33 6 12 34 56 78" }, "profile.phone", UK_MOBILE_ONLY],
    ["a UK landline", { phone: "020 7946 0018" }, "profile.phone", UK_MOBILE_ONLY],
    ["an empty phone", { phone: "" }, "profile.phone", UK_MOBILE_ONLY],
    [
      "a name with a right-to-left override",
      { fullName: "Ali\u202Ece" },
      "profile.fullName",
      "Your name contains a hidden character. Please type it again.",
    ],
    [
      "a name with a zero-width space",
      { fullName: "Ali\u200Bce" },
      "profile.fullName",
      "Your name contains a hidden character. Please type it again.",
    ],
    [
      "a name of 81 characters",
      { fullName: "A".repeat(81) },
      "profile.fullName",
      "Please keep your name to 80 characters.",
    ],
    ["30 February", { birthdayDay: 30, birthdayMonth: 2 }, "profile.birthday", BIRTHDAY_INVALID],
    [
      "a day without a month",
      { birthdayDay: 3, birthdayMonth: null },
      "profile.birthday",
      BIRTHDAY_INVALID,
    ],
    ["13+ not ticked", { over13: false }, "profile.over13", OVER_13_REQUIRED],
  ])("refuses %s with a field message and writes nothing", async (_l, over, field, message) => {
    const c = await customer();
    const res = await call(c, (await makeShop()).shopCode, { profile: over });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { [field]: [message] } },
    });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
  });

  it("stores the name in NFC and the phone as E.164 under the blind index, whatever the typing", async () => {
    const c = await customer();
    await call(c, (await makeShop()).shopCode, {
      profile: { fullName: "Siân Jones", phone: "+44 (0)7400 123 456" },
    });
    const [p] = (await rowsFor(c.id)).profiles;
    expect(p?.fullName).toBe("Siân Jones");
    expect(p?.phoneEnc).toMatch(/^v1\./);
    expect(p?.phoneEnc).not.toContain("7400");
  });

  it("an answer to an outdated consent wording is refused (CONFLICT) and nothing is written", async () => {
    const c = await customer();
    const res = await call(c, (await makeShop()).shopCode, { consentVersion: "2020-01-01" });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: CONSENT_OUTDATED },
    });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
  });

  it("a rename inside the 60 s landing cache: the answer to the cached wording is refused, the fresh one is stored (P1-A batch M2)", async () => {
    const c = await customer();
    const shop = await makeShop({ name: "Corner Bakery" });
    await invalidateShopLanding(shop.shopCode);
    const before = await loadShopLanding(shop.shopCode); // what the landing renders: cached for 60 s
    expect(before).toMatchObject({ kind: "live", shop: { name: "Corner Bakery" } });
    // Renamed with the entry still cached (a sheet open since before the rename, or invalidation failed).
    await db().execute(sql`UPDATE shops SET name = 'Corner Bakery & Deli' WHERE id = ${shop.id}`);
    const stale = await loadShopLanding(shop.shopCode);
    const staleName = stale.kind === "live" ? stale.shop.name : "";
    expect(staleName).toBe("Corner Bakery");
    const refused = await call(c, shop.shopCode, {
      marketingOptIn: true,
      consentShopName: staleName,
    });
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: CONSENT_OUTDATED },
    });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
    // The sheet refreshes; once the entry is fresh it shows the new name and the answer is stored.
    await invalidateShopLanding(shop.shopCode);
    const fresh = await loadShopLanding(shop.shopCode);
    const freshName = fresh.kind === "live" ? fresh.shop.name : "";
    expect(freshName).toBe("Corner Bakery & Deli");
    expect(
      await call(c, shop.shopCode, { marketingOptIn: true, consentShopName: freshName }),
    ).toMatchObject({ ok: true });
    expect((await rowsFor(c.id)).consents).toMatchObject([{ optedIn: true }]);
  });

  it("a suspended shop is refused with its message; a restricted one can be joined", async () => {
    const c = await customer();
    const res = await call(c, (await makeShop({ status: "suspended" })).shopCode);
    expect(res).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN", message: SHOP_NOT_JOINABLE },
    });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
    const ok = await call(c, (await makeShop({ status: "restricted" })).shopCode);
    expect(ok).toMatchObject({ ok: true, data: { firstJoin: true } });
  });

  it("parallel taps join once", async () => {
    const c = await customer();
    const shop = await makeShop();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call(c, shop.shopCode, { marketingOptIn: true })),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.data.firstJoin)).toHaveLength(1);
    const rows = await rowsFor(c.id);
    expect(rows.profiles).toHaveLength(1);
    expect(rows.memberships).toHaveLength(1);
    expect(rows.consents).toHaveLength(1);
    expect(rows.audits).toHaveLength(1);
  });
});

describe("[P1-04] join.shop limits (both fail closed)", () => {
  /** Adds `times` entries to a bucket under its real `max` (the limiter never adds past `max`). */
  const fill = async (key: string, times: number, max: number, windowSec: number) => {
    for (let i = 0; i < times; i++) await limit({ key, max, windowSec, onError: "closed" });
  };

  it("the 31st join call in an hour is refused before anything is read or written", async () => {
    const c = await customer();
    await fill(userKey("action:join.shop", c.id), 30, 30, 3600);
    const res = await call(c, (await makeShop()).shopCode);
    expect(res).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
  });

  it("the 51st new membership in a day is refused and rolled back; re-scanning a joined shop still works", async () => {
    const c = await customer();
    const joined = await makeShop();
    expect(await call(c, joined.shopCode)).toMatchObject({ ok: true });
    // 49 more new memberships fill the day's 50.
    await fill(userKey("join.new-membership", c.id), 49, 50, 86400);

    const res = await call(c, (await makeShop()).shopCode);
    expect(res).toEqual({
      ok: false,
      error: { code: "RATE_LIMITED", message: TOO_MANY_NEW_SHOPS },
    });
    const rows = await rowsFor(c.id);
    expect(rows.memberships.map((m) => m.shopId)).toEqual([joined.id]);
    expect(rows.consents).toHaveLength(1);
    expect(rows.audits).toHaveLength(1);

    expect(await call(c, joined.shopCode, { profile: null })).toMatchObject({
      ok: true,
      data: { firstJoin: false },
    });
  });

  it("Redis down: the join is refused with a friendly 503 and nothing is written", async () => {
    const c = await customer();
    faults.redisDown = down;
    const res = await call(c, (await makeShop()).shopCode);
    expect(res).toMatchObject({ ok: false, error: { code: "UNAVAILABLE" } });
    expect(await rowsFor(c.id)).toEqual(nothingWritten);
  });
});
