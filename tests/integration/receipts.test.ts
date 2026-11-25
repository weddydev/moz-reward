import { describe, expect, it } from "vitest";
import { receiptRow } from "@/features/shop/view";
import { mintCustomerScope } from "@/server/authz/scope";
import { RECENT_RECEIPTS, readOwnReceipts } from "@/server/repos/receipts";
import { makeMembership, makeProgramme, makeShop, makeUser } from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-12 (C-69): the shop page's Recent receipts read: the caller's own receipts at that shop, newest first, at
 * most five; never another customer's or another shop's (RLS `receipts_own_read` behind the join).
 */
describe("[P1-12] recent receipts read (C-69)", () => {
  it("lists the member's latest receipts at that shop, newest first, five at most", async () => {
    const [me, other, shop, elsewhere] = await Promise.all([
      makeUser(),
      makeUser(),
      makeShop({ status: "active", name: "Bean There" }),
      makeShop({ status: "active", name: "Elsewhere" }),
    ]);
    await Promise.all([
      makeProgramme(shop.id, 1_000, { earnMode: "per_pound", earnRate: 10, streak: null }),
      makeProgramme(elsewhere.id),
    ]);
    const [mine, theirs, mineElsewhere] = await Promise.all([
      makeMembership(me.id, shop.id),
      makeMembership(other.id, shop.id),
      makeMembership(me.id, elsewhere.id),
    ]);
    const numbers: number[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const res = await approvedVisit(mine, {
        amountPence: i * 100,
        items: i === 7 ? ["Flat white", "Croissant"] : [],
      });
      numbers.push(res.receiptNumber);
      if (i === 3) await approvedVisit(theirs, { amountPence: 500 });
    }
    await approvedVisit(mineElsewhere);

    const scope = mintCustomerScope({ userId: me.id });
    const list = await readOwnReceipts(scope, shop.id);
    expect(RECENT_RECEIPTS).toBe(5);
    // Receipt numbers are per shop: the other customer's visit took one of them, so mine skip it.
    expect(list.map((r) => r.number)).toEqual(numbers.slice(-5).reverse());
    expect(receiptRow(list[0]!)).toMatchObject({
      gold: "+70 gold",
      items: "Flat white, Croissant",
    });
    // Another customer's read of the same shop holds only their own receipt.
    const theirList = await readOwnReceipts(mintCustomerScope({ userId: other.id }), shop.id);
    expect(theirList).toHaveLength(1);
    expect(numbers).not.toContain(theirList[0]?.number);
    // Another shop's receipts stay on that shop's page.
    expect((await readOwnReceipts(scope, elsewhere.id)).map((r) => r.data.shopName)).toEqual([
      "Elsewhere",
    ]);
    // A stranger to the shop reads nothing.
    const stranger = mintCustomerScope({ userId: (await makeUser()).id });
    expect(await readOwnReceipts(stranger, shop.id)).toEqual([]);
  });
});
