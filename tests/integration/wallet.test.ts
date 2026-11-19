import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mintCustomerScope, mintShopScope } from "@/server/authz/scope";
import { observeQueries } from "@/server/db/client";
import { loyaltyPrograms } from "@/server/db/schema";
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

/**
 * P1-07 Wallet read: a fixed number of SQL statements whatever the membership count, only the caller's current
 * memberships, suspended/closed shops shown (flagged), left ones hidden, and the programme read wall (0025).
 */

// Wed 18 Nov 2026, 10:00 London.
const NOW = new Date("2026-11-18T10:00:00Z");
const TODAY = "2026-11-18";

/** A customer who is a member of `n` live shops, each with a programme and opening hours. */
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
      await makeMembership(user.id, shop.id, {
        purchaseCount: i % 4,
        progressGold: (i * 37) % 1_000,
      });
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
    // Scope settings + memberships + programmes + hours + closures.
    expect(a.length).toBeLessThanOrEqual(6);
    const read = await readOwnWallet(fifty.scope, TODAY);
    expect(read.memberships).toHaveLength(50);
    expect(read.programmes.size).toBe(50);
    expect(read.hours.size).toBe(50);
    expect(read.closures.size).toBe(50);
  });

  it("an empty wallet stops after the memberships query", async () => {
    const scope = mintCustomerScope({ userId: (await makeUser()).id });
    const empty = await statements(scope);
    const one = await statements((await customerWith(1)).scope);
    expect(empty.length).toBe(one.length - 3);
    expect(await loadWallet(scope, NOW)).toEqual({
      cards: [],
      summary: { rewardsReady: 0, ingotsCompleted: 0 },
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
    expect(view.summary).toEqual({ rewardsReady: 0, ingotsCompleted: 4 });
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
