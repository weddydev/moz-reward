import { describe, expect, it } from "vitest";
import { londonDays } from "@/lib/dashboard/kpis";
import { newId } from "@/lib/id";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { ledgerEntries } from "@/server/db/schema/ledger";
import { readDailyTotals } from "@/server/repos/dashboard";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

type Row = { type: (typeof ledgerEntries.$inferInsert)["type"]; points: number; at: string };

/** Ledger rows at chosen instants, written past the web role's guard (it stamps `created_at = now()`). */
async function ledgerAt(shopId: string, membershipId: string, rows: Row[]): Promise<void> {
  await db()
    .insert(ledgerEntries)
    .values(
      rows.map((r) => ({
        membershipId,
        shopId,
        type: r.type,
        points: r.points,
        idempotencyKey: `${newId()}:${r.type}`,
        createdAt: new Date(r.at),
      })),
    );
}

async function twoShops() {
  const [owner, ownerB, member, shopA, shopB] = await Promise.all([
    makeUser(),
    makeUser(),
    makeUser(),
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
  ]);
  await Promise.all([
    makeStaff(shopA.id, owner.id, "owner"),
    makeStaff(shopB.id, ownerB.id, "owner"),
  ]);
  const [mA, mB] = await Promise.all([
    makeMembership(member.id, shopA.id, { joinedAt: new Date("2026-10-20T10:00:00Z") }),
    makeMembership(member.id, shopB.id, { joinedAt: new Date("2026-10-20T10:00:00Z") }),
  ]);
  return {
    shopA,
    shopB,
    mA,
    mB,
    scopeA: mintShopScope({ userId: owner.id, shopId: shopA.id, role: "owner" }),
    scopeB: mintShopScope({ userId: ownerB.id, shopId: shopB.id, role: "owner" }),
  };
}

describe("[P2-01] dashboard daily totals", () => {
  it("[P2-01] counts visits, issued gold and joins per UK day, across the autumn clock change", async () => {
    const w = await twoShops();
    // Sunday 25 Oct 2026 is 25 hours long (BST ends at 02:00 BST = 01:00 UTC).
    await ledgerAt(w.shopA.id, w.mA.id, [
      { type: "earn", points: 100, at: "2026-10-24T22:59:59Z" }, // 23:59:59 BST Sat 24
      { type: "earn", points: 50, at: "2026-10-24T23:00:00Z" }, // 00:00 BST Sun 25
      { type: "bonus_streak", points: 20, at: "2026-10-25T12:00:00Z" },
      { type: "earn", points: 30, at: "2026-10-25T23:59:59Z" }, // 23:59:59 GMT Sun 25
      { type: "reversal", points: -30, at: "2026-10-26T09:00:00Z" },
      { type: "redeem", points: 0, at: "2026-10-26T09:30:00Z" }, // not gold issued, not a visit
      { type: "expiry", points: -10, at: "2026-10-26T03:00:00Z" }, // expiry isn't the shop giving gold
      { type: "earn", points: 40, at: "2026-10-26T00:00:00Z" }, // 00:00 GMT Mon 26
    ]);
    await Promise.all([
      makeMembership((await makeUser()).id, w.shopA.id, {
        joinedAt: new Date("2026-10-25T00:30:00Z"),
      }),
      makeMembership((await makeUser()).id, w.shopA.id, {
        joinedAt: new Date("2026-10-26T08:00:00Z"),
        leftAt: new Date("2026-10-26T09:00:00Z"), // joined and left: still joined that day
      }),
    ]);

    const days = londonDays(new Date("2026-10-26T12:00:00Z"));
    const totals = await readDailyTotals(w.scopeA, {
      from: days[0]!.start,
      to: days.at(-1)!.end,
    });
    expect(totals.get("2026-10-24")).toEqual({ visits: 1, gold: 100, joins: 0 });
    expect(totals.get("2026-10-25")).toEqual({ visits: 2, gold: 100, joins: 1 });
    expect(totals.get("2026-10-26")).toEqual({ visits: 1, gold: 10, joins: 1 });
    expect(totals.has("2026-10-23")).toBe(false);
  });

  it("[P2-01] never counts another shop's visits, gold or members, and stays inside the range", async () => {
    const w = await twoShops();
    await ledgerAt(w.shopA.id, w.mA.id, [{ type: "earn", points: 10, at: "2026-11-27T10:00:00Z" }]);
    await ledgerAt(w.shopB.id, w.mB.id, [
      { type: "earn", points: 999, at: "2026-11-27T10:00:00Z" },
      { type: "earn", points: 999, at: "2026-11-27T11:00:00Z" },
    ]);
    await makeMembership((await makeUser()).id, w.shopB.id, {
      joinedAt: new Date("2026-11-27T12:00:00Z"),
    });
    // Outside the window on both sides.
    await ledgerAt(w.shopA.id, w.mA.id, [
      { type: "earn", points: 5, at: "2026-11-20T23:59:59Z" },
      { type: "earn", points: 5, at: "2026-11-28T00:00:00Z" },
    ]);

    const days = londonDays(new Date("2026-11-27T15:00:00Z"));
    const range = { from: days[0]!.start, to: days.at(-1)!.end };
    const a = await readDailyTotals(w.scopeA, range);
    expect([...a.entries()]).toEqual([["2026-11-27", { visits: 1, gold: 10, joins: 0 }]]);
    const b = await readDailyTotals(w.scopeB, range);
    expect(b.get("2026-11-27")).toEqual({ visits: 2, gold: 1998, joins: 1 });
  });

  it("[P2-01] a staff member reads the same totals as the owner (approved through the real path)", async () => {
    const w = await twoShops();
    const staff = await makeUser();
    await Promise.all([makeStaff(w.shopA.id, staff.id, "staff"), makeProgramme(w.shopA.id)]);
    const visit = await approvedVisit(w.mA);
    expect(visit.requestId).toBeTruthy();
    const days = londonDays(new Date());
    const range = { from: days[0]!.start, to: days.at(-1)!.end };
    const staffScope = mintShopScope({ userId: staff.id, shopId: w.shopA.id, role: "staff" });
    const [asOwner, asStaff] = await Promise.all([
      readDailyTotals(w.scopeA, range),
      readDailyTotals(staffScope, range),
    ]);
    expect(asStaff).toEqual(asOwner);
    expect(asOwner.get(days.at(-1)!.date)?.visits).toBe(1);
  });

  it("[P2-01] a new shop reads no rows at all", async () => {
    const [owner, shop] = await Promise.all([makeUser(), makeShop({ status: "active" })]);
    await makeStaff(shop.id, owner.id, "owner");
    const days = londonDays(new Date());
    const totals = await readDailyTotals(
      mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }),
      { from: days[0]!.start, to: days.at(-1)!.end },
    );
    expect(totals.size).toBe(0);
  });
});
