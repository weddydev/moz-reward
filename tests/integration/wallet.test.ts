import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mintCustomerScope, mintShopScope } from "@/server/authz/scope";
import { observeQueries, testOwnerDb } from "@/server/db/client";
import { loyaltyPrograms, memberships, rewards } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { readOwnWallet } from "@/server/repos/wallet";
import { loadWallet } from "@/server/services/wallet";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeShopHours,
  makeStaff,
  makeUser,
  setShopStatus,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-07 Wallet read: a fixed number of SQL statements whatever the membership count, only the caller's current
 * memberships, suspended/closed shops shown (flagged), left ones hidden, and the programme read wall (0025).
 */

// Wed 18 Nov 2026, 10:00 London.
const NOW = new Date("2026-11-18T10:00:00Z");
const TODAY = "2026-11-18";

/** A customer who is a member of `n` live shops, each with a programme, opening hours and one approved visit. */
async function customerWith(n: number) {
  const user = await makeUser();
  const shops = await Promise.all(Array.from({ length: n }, () => makeShop({ status: "active" })));
  await Promise.all(
    shops.map(async (shop, i) => {
      await makeProgramme(shop.id);
      await makeShopHours(
        shop.id,
        [{ weekday: 3, opens: "08:00", closes: "18:00" }],
        [{ date: "2026-11-19" }],
      );
      const m = await makeMembership(user.id, shop.id, {
        purchaseCount: i % 4,
        progressGold: (i * 37) % 1_000,
      });
      await approvedVisit(m);
    }),
  );
  return { scope: mintCustomerScope({ userId: user.id }), shops };
}

/** The SQL statements the Wallet read sends for `scope`. */
async function statements(scope: ReturnType<typeof mintCustomerScope>): Promise<string[]> {
  const seen: string[] = [];
  const stop = observeQueries((q) => seen.push(q));
  try {
    await readOwnWallet(scope, TODAY);
  } finally {
    stop();
  }
  return seen;
}

describe("[P1-07] wallet read: fixed query count", () => {
  it("sends the same statements for 1 and for 50 memberships (no N+1)", async () => {
    const [one, fifty] = await Promise.all([customerWith(1), customerWith(50)]);
    const a = await statements(one.scope);
    const b = await statements(fifty.scope);
    expect(b.length).toBe(a.length);
    // Scope settings + memberships + programmes + hours + closures + rewards ready + activity + recent awards.
    expect(a.length).toBeLessThanOrEqual(9);
    const read = await readOwnWallet(fifty.scope, TODAY);
    expect(read.memberships).toHaveLength(50);
    expect(read.programmes.size).toBe(50);
    expect(read.hours.size).toBe(50);
    expect(read.closures.size).toBe(50);
    expect(read.recentAwards.size).toBe(50);
    expect(read.activity).toHaveLength(5);
  });

  it("an empty wallet stops after the memberships query", async () => {
    const scope = mintCustomerScope({ userId: (await makeUser()).id });
    const empty = await statements(scope);
    const one = await statements((await customerWith(1)).scope);
    expect(empty.length).toBe(one.length - 6);
    expect(await loadWallet(scope, NOW)).toEqual({
      cards: [],
      summary: { rewardsReady: 0, ingotsCompleted: 0, gold: 0, shops: 0 },
      activity: [],
    });
  });
});

describe("[P1-07] wallet read: what a customer sees", () => {
  let w: Awaited<ReturnType<typeof world>>;

  async function world() {
    const [me, other] = await Promise.all([makeUser(), makeUser()]);
    const [live, quiet, suspended, closed, left, notMine] = await Promise.all([
      makeShop({ status: "active", name: "Busy Café" }),
      makeShop({ status: "grace", name: "Quiet Bakery", tradingName: "The Quiet One" }),
      makeShop({ status: "active", name: "Paused Barber" }),
      makeShop({ status: "active", name: "Gone Deli" }),
      makeShop({ status: "active", name: "Left Bar" }),
      makeShop({ status: "active", name: "Someone Else's" }),
    ]);
    await Promise.all([makeProgramme(live.id), makeProgramme(left.id), makeProgramme(notMine.id)]);
    await makeShopHours(live.id, [{ weekday: 3, opens: "08:00", closes: "18:00" }]);
    await Promise.all([
      makeMembership(me.id, live.id, {
        purchaseCount: 9,
        progressGold: 720,
        ingotsCompleted: 3,
        lastVisitAt: new Date("2026-11-16T12:00:00Z"),
      }),
      makeMembership(me.id, quiet.id, { purchaseCount: 9, progressGold: 100 }),
      makeMembership(me.id, suspended.id, { purchaseCount: 1, ingotsCompleted: 1 }),
      makeMembership(me.id, closed.id),
      makeMembership(me.id, left.id, { purchaseCount: 50, leftAt: new Date() }),
      makeMembership(other.id, notMine.id, { purchaseCount: 99 }),
    ]);
    await setShopStatus(suspended.id, "suspended");
    await setShopStatus(closed.id, "closed");
    return {
      me: mintCustomerScope({ userId: me.id }),
      other: mintCustomerScope({ userId: other.id }),
      live,
      left,
      notMine,
    };
  }

  beforeAll(async () => {
    w = await world();
  });

  it("shows current memberships in Wallet order, with progress, status and the trading name", async () => {
    const view = await loadWallet(w.me, NOW);
    expect(view.cards.map((c) => [c.name, c.availability])).toEqual([
      ["Busy Café", "live"],
      ["The Quiet One", "live"],
      ["Paused Barber", "suspended"],
      ["Gone Deli", "closed"],
    ]);
    expect(view.cards[0]).toMatchObject({
      progress: 0.72,
      ingotSize: 1_000,
      label: "72%",
      open: { tone: "open", text: "Open · closes 18:00" },
    });
    // No programme yet.
    expect(view.cards[1]).toMatchObject({ ingotSize: null, label: "Rewards not set up yet" });
    // The total panel: only the programme shop's 720 shows as gold (the quiet shop has none), across all 4 (left ones never show).
    expect(view.summary).toEqual({ rewardsReady: 0, ingotsCompleted: 4, gold: 720, shops: 4 });
  });

  it("hides a left membership and never shows another customer's", async () => {
    const names = (await loadWallet(w.me, NOW)).cards.map((c) => c.name);
    expect(names).not.toContain("Left Bar");
    expect(names).not.toContain("Someone Else's");
    const theirs = await loadWallet(w.other, NOW);
    expect(theirs.cards.map((c) => c.name)).toEqual(["Someone Else's"]);
  });

  it("a pending shop's membership is not shown (the shop isn't public)", async () => {
    const user = await makeUser();
    const shop = await makeShop({ status: "active", name: "Not Yet Open" });
    await makeMembership(user.id, shop.id);
    await setShopStatus(shop.id, "pending");
    expect((await loadWallet(mintCustomerScope({ userId: user.id }), NOW)).cards).toEqual([]);
  });
});

describe("[P1-12] wallet reads from the ledger and rewards (C-62)", () => {
  let w: Awaited<ReturnType<typeof world>>;

  /**
   * Me: a per-visit shop with 12 approved visits (100 gold each: the ingot fills at the 10th, unlocking its
   * rewards), a per-£1 shop with 12 visits of £1…£12 (10…120 gold), and a shop I left after a visit. Another
   * customer has visits at the per-visit shop too.
   */
  async function world() {
    const [me, other] = await Promise.all([makeUser(), makeUser()]);
    const [visits, pounds, left] = await Promise.all([
      makeShop({ status: "active", name: "Visit Café" }),
      makeShop({ status: "active", name: "Pound Deli" }),
      makeShop({ status: "active", name: "Left Bar" }),
    ]);
    await Promise.all([
      makeProgramme(visits.id),
      makeProgramme(pounds.id, 1_000, { earnMode: "per_pound", earnRate: 10, streak: null }),
      makeProgramme(left.id),
    ]);
    const [mVisits, mPounds, mLeft, theirs] = await Promise.all([
      makeMembership(me.id, visits.id),
      makeMembership(me.id, pounds.id),
      makeMembership(me.id, left.id),
      makeMembership(other.id, visits.id),
    ]);
    const lastRequests: string[] = [];
    for (let i = 1; i <= 12; i += 1) {
      lastRequests.push((await approvedVisit(mVisits)).requestId);
      lastRequests.push((await approvedVisit(mPounds, { amountPence: i * 100 })).requestId);
    }
    await approvedVisit(mLeft);
    await approvedVisit(theirs);
    await testOwnerDb()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, mLeft.id));
    return {
      me: mintCustomerScope({ userId: me.id }),
      other: mintCustomerScope({ userId: other.id }),
      visits,
      pounds,
      left,
      mVisits,
      mPounds,
      mLeft,
      lastRequests,
    };
  }

  beforeAll(async () => {
    w = await world();
  });

  it("rewards ready counts the current memberships' unredeemed rewards, never a left one's or another customer's", async () => {
    const [row] = await testOwnerDb()
      .select({ n: count() })
      .from(rewards)
      .where(
        and(
          inArray(rewards.membershipId, [w.mVisits.id, w.mPounds.id]),
          isNull(rewards.redeemedAt),
        ),
      );
    const expected = row?.n ?? 0;
    expect(expected).toBeGreaterThan(0); // the per-visit ingot filled: its main reward and milestone
    const view = await loadWallet(w.me, NOW);
    expect(view.summary.rewardsReady).toBe(expected);
    expect((await loadWallet(w.other, NOW)).summary.rewardsReady).toBe(0);
  });

  it("recent activity: the last 5 approved visits across shops, newest first, with the shop's name", async () => {
    const view = await loadWallet(w.me, NOW);
    expect(view.activity.map((a) => a.requestId)).toEqual(w.lastRequests.slice(-5).reverse());
    expect(new Set(view.activity.map((a) => a.shopName))).toEqual(
      new Set(["Visit Café", "Pound Deli"]),
    );
    // The newest: Pound Deli's £12 visit, 120 gold.
    expect(view.activity[0]).toMatchObject({ shopName: "Pound Deli", gold: "+120 gold" });
    const theirs = await loadWallet(w.other, NOW);
    expect(theirs.activity).toHaveLength(1);
    expect(theirs.activity[0]?.shopName).toBe("Visit Café");
  });

  it("each membership's last 10 earn amounts, oldest first, feed the visits estimate", async () => {
    const read = await readOwnWallet(w.me, TODAY);
    expect(read.recentAwards.get(w.mPounds.id)).toEqual([
      30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ]);
    expect(read.recentAwards.get(w.mVisits.id)).toEqual(Array.from({ length: 10 }, () => 100));
    expect(read.recentAwards.has(w.mLeft.id)).toBe(false);
    const card = (await loadWallet(w.me, NOW)).cards.find((c) => c.name === "Pound Deli");
    // 780 of 1,000 after 12 visits; the last awards average 75 gold, so about 3 more visits.
    expect(card?.label).toMatch(/^78% · \d+ more visits?$/);
  });
});

describe("[P1-07] loyalty programme read wall (0025)", () => {
  const read = (scope: Parameters<typeof withScope>[0], shopId: string) =>
    withScope(scope, (q) =>
      q
        .select({ id: loyaltyPrograms.id })
        .from(loyaltyPrograms)
        .where(eq(loyaltyPrograms.shopId, shopId)),
    );

  it("a current member reads their shop's programme; a non-member and a left member read nothing", async () => {
    const [shop, member, stranger, leaver] = await Promise.all([
      makeShop({ status: "active" }),
      makeUser(),
      makeUser(),
      makeUser(),
    ]);
    await makeProgramme(shop.id);
    await Promise.all([
      makeMembership(member.id, shop.id),
      makeMembership(leaver.id, shop.id, { leftAt: new Date() }),
    ]);
    expect(await read(mintCustomerScope({ userId: member.id }), shop.id)).toHaveLength(1);
    expect(await read(mintCustomerScope({ userId: stranger.id }), shop.id)).toHaveLength(0);
    expect(await read(mintCustomerScope({ userId: leaver.id }), shop.id)).toHaveLength(0);
  });

  it("membership elsewhere grants nothing: a staff member's own memberships don't open another shop's programme", async () => {
    const [shopA, shopB, staffer] = await Promise.all([
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
      makeUser(),
    ]);
    await Promise.all([makeProgramme(shopA.id), makeProgramme(shopB.id)]);
    await makeStaff(shopA.id, staffer.id, "staff");
    await makeMembership(staffer.id, shopA.id);
    const staffScope = mintShopScope({ userId: staffer.id, shopId: shopA.id, role: "staff" });
    expect(await read(staffScope, shopA.id)).toHaveLength(1);
    expect(await read(staffScope, shopB.id)).toHaveLength(0);
    expect(await read(mintCustomerScope({ userId: staffer.id }), shopB.id)).toHaveLength(0);
  });
});
