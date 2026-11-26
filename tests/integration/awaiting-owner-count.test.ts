import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { pointRequests } from "@/server/db/schema";
import { countAwaitingOwner } from "@/server/repos/point-requests";
import { makeMembership, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P1-C close, code review M3: the count on the owner's Requests nav item (`countAwaitingOwner`). Only the
 * scoped shop's `awaiting_owner` requests inside the window; RLS keeps another shop's out even when the
 * service's filter is bypassed by a scope for a shop the caller isn't on.
 */
const HOUR = 3_600_000;
const now = Date.now();
const window = { requestedAfter: new Date(now - 24 * HOUR) };

async function request(
  shopId: string,
  agoMs: number,
  status: "pending" | "awaiting_owner" | "rejected" = "awaiting_owner",
): Promise<void> {
  const user = await makeUser();
  const m = await makeMembership(user.id, shopId);
  await db()
    .insert(pointRequests)
    .values({
      membershipId: m.id,
      userId: user.id,
      shopId,
      idempotencyKey: newId(),
      requestedAt: new Date(now - agoMs),
      status,
      ...(status === "pending" ? {} : { decidedAt: status === "rejected" ? new Date(now) : null }),
      ...(status === "awaiting_owner" ? { amountPence: 1250, awardGold: 13 } : {}),
      ...(status === "rejected" ? { rejectReason: "no_purchase" as const } : {}),
    });
}

let w: Awaited<ReturnType<typeof world>>;
async function world() {
  const [shopA, shopB] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
  ]);
  const ownerA = await makeUser();
  await makeStaff(shopA.id, ownerA.id, "owner");
  const ownerB = await makeUser();
  await makeStaff(shopB.id, ownerB.id, "owner");
  // Shop A: two awaiting the owner inside 24 h, one awaiting past 24 h, one pending, one rejected.
  await request(shopA.id, HOUR);
  await request(shopA.id, 23 * HOUR);
  await request(shopA.id, 25 * HOUR);
  await request(shopA.id, HOUR, "pending");
  await request(shopA.id, 2 * HOUR, "rejected");
  // Shop B: three awaiting its owner.
  await request(shopB.id, HOUR);
  await request(shopB.id, HOUR);
  await request(shopB.id, HOUR);
  return { shopA, shopB, ownerA, ownerB };
}

beforeAll(async () => {
  w = await world();
});

describe("[P1-12] countAwaitingOwner (code review M3)", () => {
  it("counts the shop's awaiting_owner requests inside the window only", async () => {
    const scope = mintShopScope({ userId: w.ownerA.id, shopId: w.shopA.id, role: "owner" });
    expect(await countAwaitingOwner(scope, window)).toBe(2);
    const b = mintShopScope({ userId: w.ownerB.id, shopId: w.shopB.id, role: "owner" });
    expect(await countAwaitingOwner(b, window)).toBe(3);
  });

  it("cross-shop: a scope for a shop the caller isn't on counts nothing (RLS)", async () => {
    const forged = mintShopScope({ userId: w.ownerB.id, shopId: w.shopA.id, role: "owner" });
    expect(await countAwaitingOwner(forged, window)).toBe(0);
  });

  it("an empty shop counts 0", async () => {
    const shop = await makeShop({ status: "active" });
    const owner = await makeUser();
    await makeStaff(shop.id, owner.id, "owner");
    const scope = mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" });
    expect(await countAwaitingOwner(scope, window)).toBe(0);
  });
});
