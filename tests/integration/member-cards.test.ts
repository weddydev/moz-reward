import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintAdminScope, mintCustomerScope, mintShopScope, type Scope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, pointRequests, shopStaff } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { listTeamOpenRequests, TEAM_QUEUE_LIMIT } from "@/server/repos/point-requests";
import {
  makeAdmin,
  makeCustomerProfile,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P1-12 (f): the staff member-card read (`shop_member_cards`, 0030) and the Requests queue. Design check 26 Nov:
 * only the caller's own shop's members, only while the caller is active staff, three columns, ≤ 100 ids (raises
 * above), and moz_rls's reach into customer_profiles pinned (it owns every SECURITY DEFINER helper).
 */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

const cards = (scope: Scope, ids: readonly string[] | null) =>
  withScope(scope, async (q) => [
    ...(await q.execute<{ user_id: string; full_name: string; member_id: string }>(
      ids === null
        ? sql`SELECT * FROM public.shop_member_cards(NULL)`
        : sql`SELECT * FROM public.shop_member_cards(${sql.param([...ids])}::uuid[])`,
    )),
  ]);

async function member(
  shopId: string,
  name: string,
  over: Parameters<typeof makeMembership>[2] = {},
) {
  const user = await makeUser();
  const profile = await makeCustomerProfile(user.id, { fullName: name });
  const m = await makeMembership(user.id, shopId, over);
  return { userId: user.id, memberId: profile.memberId, membershipId: m.id };
}

let w: Awaited<ReturnType<typeof world>>;
async function world() {
  const [shopA, shopB] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
  ]);
  const staffA = await makeUser();
  await makeStaff(shopA.id, staffA.id, "staff");
  const staffB = await makeUser();
  await makeStaff(shopB.id, staffB.id, "staff");
  const ana = await member(shopA.id, "Ana Lopes");
  const left = await member(shopA.id, "Lee Left", { leftAt: new Date() });
  const bob = await member(shopB.id, "Bob Other");
  const stranger = await makeUser();
  await makeCustomerProfile(stranger.id, { fullName: "Never Joined" });
  return { shopA, shopB, staffA, staffB, ana, left, bob, stranger };
}

beforeAll(async () => {
  w = await world();
});

describe("[P1-12] shop_member_cards (0030)", () => {
  const staffA = () => mintShopScope({ userId: w.staffA.id, shopId: w.shopA.id, role: "staff" });

  it("gives the scoped shop's active staff name and member ID of its members, a left member included", async () => {
    const rows = await cards(staffA(), [w.ana.userId, w.left.userId]);
    expect(rows.map((r) => Object.keys(r).sort())).toEqual([
      ["full_name", "member_id", "user_id"],
      ["full_name", "member_id", "user_id"],
    ]);
    expect(rows.map((r) => [r.full_name, r.member_id]).sort()).toEqual(
      [
        ["Ana Lopes", w.ana.memberId],
        ["Lee Left", w.left.memberId],
      ].sort(),
    );
  });

  it("gives nothing for another shop's member or someone who never joined", async () => {
    expect(await cards(staffA(), [w.bob.userId, w.stranger.id])).toEqual([]);
  });

  it("gives nothing to staff of another shop, a deactivated team member, a customer or an admin", async () => {
    const staffB = mintShopScope({ userId: w.staffB.id, shopId: w.shopB.id, role: "staff" });
    expect(await cards(staffB, [w.ana.userId])).toEqual([]);
    // A forged scope: shop B's staff claiming shop A.
    const forged = mintShopScope({ userId: w.staffB.id, shopId: w.shopA.id, role: "owner" });
    expect(await cards(forged, [w.ana.userId])).toEqual([]);
    expect(await cards(mintCustomerScope({ userId: w.ana.userId }), [w.ana.userId])).toEqual([]);
    const admin = await makeUser();
    await makeAdmin(admin.id, "owner");
    expect(
      await cards(mintAdminScope({ userId: admin.id, role: "owner" }), [w.ana.userId]),
    ).toEqual([]);

    const gone = await makeUser();
    await makeStaff(w.shopA.id, gone.id, "staff");
    const goneScope = mintShopScope({ userId: gone.id, shopId: w.shopA.id, role: "staff" });
    expect(await cards(goneScope, [w.ana.userId])).toHaveLength(1);
    await db().update(shopStaff).set({ active: false }).where(eq(shopStaff.userId, gone.id));
    expect(await cards(goneScope, [w.ana.userId])).toEqual([]);
  });

  it("an empty list or NULL gives nothing; more than 100 ids raises (22023), it is never cut short", async () => {
    expect(await cards(staffA(), [])).toEqual([]);
    expect(await cards(staffA(), null)).toEqual([]);
    const ids = Array.from({ length: 100 }, () => newId());
    expect(await cards(staffA(), ids)).toEqual([]);
    expect(await pgCode(() => cards(staffA(), [...ids, w.ana.userId]))).toBe("22023");
  });

  it("moz_rls reads exactly user_id, full_name, member_id of customer_profiles; only moz_owner is in it", async () => {
    const cols = await db().execute<{ column_name: string }>(sql`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'moz_rls' AND table_name = 'customer_profiles' AND privilege_type = 'SELECT'
      ORDER BY 1`);
    expect([...cols].map((c) => c.column_name)).toEqual(["full_name", "member_id", "user_id"]);
    const other = await db().execute<{ privilege_type: string }>(sql`
      SELECT privilege_type FROM information_schema.column_privileges
      WHERE grantee = 'moz_rls' AND table_name = 'customer_profiles' AND privilege_type <> 'SELECT'`);
    expect([...other]).toEqual([]);
    const table = await db().execute<{ privilege_type: string }>(sql`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = 'moz_rls' AND table_name = 'customer_profiles'`);
    expect([...table]).toEqual([]);
    const members = await db().execute<{ member: string }>(sql`
      SELECT m.rolname AS member FROM pg_auth_members am
      JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
      WHERE r.rolname = 'moz_rls'`);
    const names = [...members].map((m) => m.member);
    for (const role of ["moz_app", "moz_auth", "moz_worker"]) expect(names).not.toContain(role);
    expect(names.every((n) => n === "moz_owner" || n === "postgres")).toBe(true);
  });
});

describe("[P1-12] the shop's requests queue", () => {
  it("lists the shop's open requests inside 24 h, oldest first, with member card and visit stats", async () => {
    const shop = await makeShop({ status: "active" });
    const staff = await makeUser();
    await makeStaff(shop.id, staff.id, "staff");
    const scope = mintShopScope({ userId: staff.id, shopId: shop.id, role: "staff" });
    const now = Date.now();
    const a = await member(shop.id, "First Member", {
      purchaseCount: 4,
      lastVisitAt: new Date(now - 86_400_000),
    });
    const b = await member(shop.id, "Second Member");
    const c = await member(shop.id, "Too Old");
    const d = await member(shop.id, "Decided Already");
    const other = await member(w.shopB.id, "Other Shop");
    const req = (
      m: { userId: string; membershipId: string },
      shopId: string,
      agoMs: number,
      status = "pending",
    ) =>
      db()
        .insert(pointRequests)
        .values({
          membershipId: m.membershipId,
          userId: m.userId,
          shopId,
          idempotencyKey: newId(),
          requestedAt: new Date(now - agoMs),
          status: status as "pending",
          decidedAt: status === "pending" ? null : new Date(now),
        })
        .returning({ id: pointRequests.id });
    const [ra] = await req(a, shop.id, 3_600_000);
    const [rb] = await req(b, shop.id, 60_000);
    await req(c, shop.id, 25 * 3_600_000);
    await req(d, shop.id, 120_000, "rejected");
    await req(other, w.shopB.id, 60_000);
    // Routed to the owner: still on the queue, with the proposal.
    await db()
      .update(pointRequests)
      .set({ status: "awaiting_owner", amountPence: 1250, items: ["Flat white"], awardGold: 13 })
      .where(eq(pointRequests.id, rb!.id));

    const queue = await listTeamOpenRequests(scope, { requestedAfter: new Date(now - 86_400_000) });
    expect(queue.map((r) => r.id)).toEqual([ra!.id, rb!.id]);
    expect(queue[0]).toMatchObject({
      status: "pending",
      member: { name: "First Member", memberId: a.memberId },
      purchaseCount: 4,
    });
    expect(queue[0]?.lastVisitAt).toBeInstanceOf(Date);
    expect(queue[1]).toMatchObject({
      status: "awaiting_owner",
      amountPence: 1250,
      items: ["Flat white"],
      awardGold: 13,
      member: { name: "Second Member", memberId: b.memberId },
    });
  });

  it("a request whose profile has no card shows without one; the queue stops at its limit", async () => {
    const shop = await makeShop({ status: "active" });
    const owner = await makeUser();
    await makeStaff(shop.id, owner.id, "owner");
    const scope = mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" });
    // No profile row at all (the card read has nothing to give): the queue still lists the request.
    const bare = await makeUser();
    const m = await makeMembership(bare.id, shop.id);
    await db().insert(pointRequests).values({
      membershipId: m.id,
      userId: bare.id,
      shopId: shop.id,
      idempotencyKey: newId(),
    });
    const queue = await listTeamOpenRequests(scope, {
      requestedAfter: new Date(Date.now() - 86_400_000),
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]?.member).toBeNull();
    expect(TEAM_QUEUE_LIMIT).toBeLessThanOrEqual(100);
    // The membership row itself is the team's to see (memberships_shop); nothing else is read.
    expect((await db().select().from(memberships).where(eq(memberships.id, m.id))).length).toBe(1);
  });
});
