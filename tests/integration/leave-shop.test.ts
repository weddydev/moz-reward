import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MARKETING_CONSENT_VERSION } from "@/lib/marketing-consent";
import { mintCustomerScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { marketingConsents, memberships } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { transaction } from "@/server/repos/_base";
import { readOwnMemberShop } from "@/server/repos/memberships";
import { createOwnProfile } from "@/server/repos/profiles";
import { joinShop } from "@/server/services/join";
import { leaveShop, setShopMuted } from "@/server/services/membership";
import { makeMembership, makeShop, makeUser, setShopStatus } from "@/server/testing/factories";

/**
 * P1-09 (PRODUCT §4): "Leave shop" and "Mute notifications". Leaving is allowed any time (day 1 included),
 * keeps the ledger and the progress counters (frozen), hides the shop and withdraws marketing consent with a
 * consent row in the same transaction (C-54). Rejoining re-opens the same row, so the frozen progress comes
 * back and nothing (join or referral bonus) is paid again. Muting changes only `muted`.
 */

type Shop = Awaited<ReturnType<typeof makeShop>>;

async function customer() {
  const user = await makeUser();
  const scope = mintCustomerScope({ userId: user.id });
  await transaction(scope, (tx) =>
    createOwnProfile(
      scope,
      { fullName: "Leah Patel", phoneE164: "+447400111222", birthday: null },
      tx,
    ),
  );
  return { id: user.id, scope };
}
type Customer = Awaited<ReturnType<typeof customer>>;

const join = (c: Customer, shop: Shop, marketingOptIn = true) =>
  transaction(c.scope, (tx) =>
    joinShop(
      c.scope,
      {
        shopCode: shop.shopCode,
        marketingOptIn,
        consentVersion: MARKETING_CONSENT_VERSION,
        consentShopName: shop.tradingName ?? shop.name,
        profile: null,
      },
      tx,
    ),
  );

const leave = (c: Customer, shopId: string) =>
  transaction(c.scope, (tx) => leaveShop(c.scope, shopId, tx));

const mute = (c: Customer, shopId: string, muted: boolean) =>
  transaction(c.scope, (tx) => setShopMuted(c.scope, shopId, muted, tx));

const membershipOf = async (userId: string, shopId: string) => {
  const [row] = await db()
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.shopId, shopId)));
  if (!row) throw new Error("membership missing");
  return row;
};

const consentsOf = (userId: string) =>
  db()
    .select({ source: marketingConsents.source, optedIn: marketingConsents.optedIn })
    .from(marketingConsents)
    .where(eq(marketingConsents.userId, userId))
    .orderBy(marketingConsents.createdAt, marketingConsents.id);

/** Progress the way P1-12 approvals will write it (worker/owner path; the web role can't). */
const giveProgress = (membershipId: string) =>
  db()
    .update(memberships)
    .set({ progressGold: 420, ingotsCompleted: 2, purchaseCount: 7, lastVisitAt: new Date() })
    .where(eq(memberships.id, membershipId));

const errorCode = async (run: () => Promise<unknown>): Promise<string | undefined> => {
  try {
    await run();
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  return undefined;
};

describe("[P1-09] leave shop", () => {
  it("works on day 1: sets left_at, withdraws marketing consent with a 'leave' consent row (C-54), hides the shop", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, true);

    expect(await leave(c, shop.id)).toEqual({ left: true });

    const m = await membershipOf(c.id, shop.id);
    expect(m.leftAt).toBeInstanceOf(Date);
    expect(m.marketingOptIn).toBe(false);
    expect(await consentsOf(c.id)).toEqual([
      { source: "join", optedIn: true },
      { source: "leave", optedIn: false },
    ]);
    // Hidden: the member read behind /shops/[id], /vault/[id] and the Wallet no longer finds it.
    expect(await readOwnMemberShop(c.scope, shop.id)).toBeNull();
  });

  it("writes no consent row when the member had not opted in (nothing to withdraw)", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, false);
    await leave(c, shop.id);
    expect(await consentsOf(c.id)).toEqual([{ source: "join", optedIn: false }]);
    expect((await membershipOf(c.id, shop.id)).marketingOptIn).toBe(false);
  });

  it("keeps the frozen progress and counters untouched", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const { membershipId } = await join(c, shop);
    await giveProgress(membershipId);
    const before = await membershipOf(c.id, shop.id);
    await leave(c, shop.id);
    const after = await membershipOf(c.id, shop.id);
    expect(after).toMatchObject({
      progressGold: before.progressGold,
      ingotsCompleted: before.ingotsCompleted,
      purchaseCount: before.purchaseCount,
      lastVisitAt: before.lastVisitAt,
      joinedAt: before.joinedAt,
    });
  });

  it("leaving twice, in sequence or in parallel, leaves once and writes one consent row", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, true);
    const results = await Promise.all([leave(c, shop.id), leave(c, shop.id)]);
    expect(results.map((r) => r.left).sort()).toEqual([false, true]);
    expect(await leave(c, shop.id)).toEqual({ left: false });
    expect((await consentsOf(c.id)).filter((r) => r.source === "leave")).toHaveLength(1);
  });

  it("is allowed in any shop status (a suspended or closed shop can't hold a customer)", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, true);
    await setShopStatus(shop.id, "suspended");
    expect(await leave(c, shop.id)).toEqual({ left: true });
  });

  it("refuses a shop the caller never joined, and never touches anyone else's membership", async () => {
    const c = await customer();
    const other = await makeUser();
    const shop = await makeShop({ status: "active" });
    await makeMembership(other.id, shop.id);
    expect(await errorCode(() => leave(c, shop.id))).toBe("NOT_FOUND");
    expect((await membershipOf(other.id, shop.id)).leftAt).toBeNull();
  });
});

describe("[P1-09] rejoin restores the frozen progress", () => {
  it("rejoin the same day: same membership, counters back as they were, consent asked again, no bonus re-earned", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const first = await join(c, shop, true);
    await giveProgress(first.membershipId);
    const before = await membershipOf(c.id, shop.id);
    await leave(c, shop.id);

    const again = await join(c, shop, false);
    expect(again).toMatchObject({ membershipId: first.membershipId, firstJoin: true });
    const after = await membershipOf(c.id, shop.id);
    // Join and referral bonuses are never re-earned (PRODUCT §4): the rejoin pays nothing; the counters are
    // exactly the frozen ones (P1-12 owns the ledger rows; there is no join bonus in the programme model).
    expect(after).toMatchObject({
      leftAt: null,
      marketingOptIn: false,
      progressGold: before.progressGold,
      ingotsCompleted: before.ingotsCompleted,
      purchaseCount: before.purchaseCount,
      joinedAt: before.joinedAt,
    });
    expect(await consentsOf(c.id)).toEqual([
      { source: "join", optedIn: true },
      { source: "leave", optedIn: false },
      { source: "rejoin", optedIn: false },
    ]);
    expect(await readOwnMemberShop(c.scope, shop.id)).toMatchObject({ shopId: shop.id });
  });

  it("rejoining 29 days after leaving still restores the progress (P1-13 owns the forfeit after 30 days)", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const first = await join(c, shop);
    await giveProgress(first.membershipId);
    await leave(c, shop.id);
    await db()
      .update(memberships)
      .set({ leftAt: sql`now() - interval '29 days'` })
      .where(eq(memberships.id, first.membershipId));
    await join(c, shop);
    expect(await membershipOf(c.id, shop.id)).toMatchObject({
      progressGold: 420,
      ingotsCompleted: 2,
    });
  });
});

describe("[P1-09] mute notifications", () => {
  it("mutes and unmutes at once, changing only `muted` (no consent row: marketing consent is separate)", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, true);
    const before = await membershipOf(c.id, shop.id);

    expect(await mute(c, shop.id, true)).toEqual({ muted: true });
    const muted = await membershipOf(c.id, shop.id);
    expect(muted.muted).toBe(true);
    expect({ ...muted, muted: false, updatedAt: before.updatedAt }).toEqual(before);
    expect(await mute(c, shop.id, true)).toEqual({ muted: true }); // idempotent
    expect(await mute(c, shop.id, false)).toEqual({ muted: false });
    expect((await membershipOf(c.id, shop.id)).muted).toBe(false);
    expect(await consentsOf(c.id)).toEqual([{ source: "join", optedIn: true }]);
  });

  it("refuses a shop the caller left or never joined", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const never = await makeShop({ status: "active" });
    await join(c, shop);
    await leave(c, shop.id);
    expect(await errorCode(() => mute(c, shop.id, true))).toBe("NOT_FOUND");
    expect(await errorCode(() => mute(c, never.id, true))).toBe("NOT_FOUND");
    expect((await membershipOf(c.id, shop.id)).muted).toBe(false);
  });
});
