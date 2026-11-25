import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { mintCustomerScope, mintShopScope, type Scope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { makeMembership, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P1-01 (C-34): customers can't write membership counters (drizzle/0014). The web role runs as the customer,
 * a shop's team and the worker; only the trigger decides which columns each may change.
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

const DENIED = "42501";

/** Every memberships column, by who may write it. A new column fails this test until it is classified here
 *  (and, if customers or the shop's team may change it, added to `customer_writable` / `staff_writable`, 0022). */
const CLASSIFIED = {
  identity: ["id", "user_id", "shop_id"],
  customerWritable: ["muted", "marketing_opt_in", "left_at"],
  dbMaintained: ["updated_at"],
  serverOwned: [
    "joined_at",
    "purchase_count",
    "last_visit_at",
    "created_at",
    // P1-07 (0025): loyalty counters, written by P1-12 approvals only.
    "progress_gold",
    "ingots_completed",
    // P1-12 (0029): the rest of the engine's member state, written by approvals beside a ledger row only.
    "ingot_started_at",
    "milestones_reached",
    "gold_shortfall",
    "tier",
    "streak_weeks",
    "streak_last_week_start",
  ],
} as const;

let w: Awaited<ReturnType<typeof world>>;

async function world() {
  const [shopA, shopB, customer, staffer, other] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await makeStaff(shopA.id, staffer.id, "staff");
  const [own, stafferInB, otherInA] = await Promise.all([
    makeMembership(customer.id, shopA.id),
    makeMembership(staffer.id, shopB.id),
    makeMembership(other.id, shopA.id),
  ]);
  return {
    shopA,
    shopB,
    own,
    stafferInB,
    otherInA,
    customer: mintCustomerScope({ userId: customer.id }),
    customerId: customer.id,
    staffA: mintShopScope({ userId: staffer.id, shopId: shopA.id, role: "staff" }),
  };
}

beforeAll(async () => {
  w = await world();
});

const update = (scope: Scope, id: string, set: Partial<typeof memberships.$inferInsert>) =>
  withScope(scope, (q) =>
    q.update(memberships).set(set).where(eq(memberships.id, id)).returning({ id: memberships.id }),
  );

describe("[P1-01] C-34 memberships: customers can't write counters", () => {
  it("classifies every memberships column (catalog)", async () => {
    const rows = await db().execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'memberships' ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(Object.values(CLASSIFIED).flat().sort());
  });

  // marketing_opt_in also needs a consent row in the same transaction (P1-04, tests/integration/join.test.ts).
  it("lets a customer change muted and left_at on their own membership", async () => {
    const leftAt = new Date("2026-11-13T10:00:00Z");
    expect(await update(w.customer, w.own.id, { muted: true, leftAt })).toHaveLength(1);
    const [row] = await db().select().from(memberships).where(eq(memberships.id, w.own.id));
    expect(row).toMatchObject({ muted: true, leftAt });
    expect(await update(w.customer, w.own.id, { leftAt: null })).toHaveLength(1);
  });

  it("refuses a customer changing any server-owned column or moving the membership", async () => {
    for (const set of [
      { purchaseCount: 99 },
      { lastVisitAt: new Date() },
      { joinedAt: new Date("2020-01-01T00:00:00Z") },
      { createdAt: new Date("2020-01-01T00:00:00Z") },
      { shopId: w.shopB.id },
      { muted: false, purchaseCount: 1 },
      { progressGold: 999 },
      { ingotsCompleted: 5 },
      { muted: true, progressGold: 1 },
    ] satisfies Partial<typeof memberships.$inferInsert>[]) {
      expect(await pgCode(() => update(w.customer, w.own.id, set)), JSON.stringify(set)).toBe(
        DENIED,
      );
    }
    const [row] = await db().select().from(memberships).where(eq(memberships.id, w.own.id));
    expect(row).toMatchObject({ purchaseCount: 0, lastVisitAt: null, shopId: w.shopA.id });
  });

  it("lets a customer join with defaults, and refuses a join that sets server-owned columns", async () => {
    const join = (over: Partial<typeof memberships.$inferInsert>) =>
      withScope(w.customer, (q) =>
        q
          .insert(memberships)
          .values({ userId: w.customerId, shopId: w.shopB.id, ...over })
          .returning({ id: memberships.id }),
      );
    for (const over of [
      { purchaseCount: 5 },
      { lastVisitAt: new Date() },
      { joinedAt: new Date("2020-01-01T00:00:00Z") },
      { createdAt: new Date("2020-01-01T00:00:00Z") },
      { progressGold: 720 },
      { ingotsCompleted: 3 },
    ] satisfies Partial<typeof memberships.$inferInsert>[]) {
      expect(await pgCode(() => join(over)), JSON.stringify(over)).toBe(DENIED);
    }
    expect(await join({})).toHaveLength(1);
    await db()
      .delete(memberships)
      .where(and(eq(memberships.userId, w.customerId), eq(memberships.shopId, w.shopB.id)));
  });

  // P1-12 (0029): the team's counter writes need a ledger entry of theirs in the same transaction (the approval);
  // the allowed path is proven in tests/integration/approvals.test.ts.
  it("refuses the shop's own team changing counters of its members without a ledger entry", async () => {
    const at = new Date("2026-11-13T12:00:00Z");
    expect(
      await pgCode(() => update(w.staffA, w.otherInA.id, { purchaseCount: 3, lastVisitAt: at })),
    ).toBe(DENIED);
  });

  it("refuses staff changing counters on their own customer membership in another shop", async () => {
    expect(await pgCode(() => update(w.staffA, w.stafferInB.id, { purchaseCount: 50 }))).toBe(
      DENIED,
    );
    expect(await update(w.staffA, w.stafferInB.id, { muted: true })).toHaveLength(1);
  });

  it("leaves the worker (system scope) free to maintain counters", async () => {
    const worker = systemScope("test: membership counters from the worker");
    expect(await update(worker, w.own.id, { purchaseCount: 7 })).toHaveLength(1);
  });
});

describe("[P1-04] memberships: a rejoin passes the same shop-status wall as a join (security review M1)", () => {
  /** A customer who left a shop that is now `status`; returns their membership id and scope. */
  async function leftMember(status: "active" | "suspended" | "closed" | "pending" | "restricted") {
    const [shop, user] = await Promise.all([makeShop({ status: "active" }), makeUser()]);
    const m = await makeMembership(user.id, shop.id);
    const scope = mintCustomerScope({ userId: user.id });
    expect(await update(scope, m.id, { leftAt: new Date() })).toHaveLength(1);
    await db().execute(sql`UPDATE shops SET status = ${status} WHERE id = ${shop.id}`);
    return { id: m.id, scope };
  }

  it("refuses a customer rejoining (left_at → null) a suspended, closed or pending shop", async () => {
    for (const status of ["suspended", "closed", "pending"] as const) {
      const m = await leftMember(status);
      expect(await pgCode(() => update(m.scope, m.id, { leftAt: null })), status).toBe(DENIED);
      const [row] = await db().select().from(memberships).where(eq(memberships.id, m.id));
      expect(row?.leftAt, status).not.toBeNull();
    }
  });

  it("lets a customer rejoin an active or restricted shop", async () => {
    for (const status of ["active", "restricted"] as const) {
      const m = await leftMember(status);
      expect(await update(m.scope, m.id, { leftAt: null }), status).toHaveLength(1);
    }
  });

  it("still lets a customer leave or mute in a suspended shop, and a left member mute there", async () => {
    const [shop, user] = await Promise.all([makeShop({ status: "suspended" }), makeUser()]);
    const m = await makeMembership(user.id, shop.id);
    const scope = mintCustomerScope({ userId: user.id });
    expect(await update(scope, m.id, { muted: true })).toHaveLength(1);
    expect(await update(scope, m.id, { leftAt: new Date() })).toHaveLength(1);
    expect(await update(scope, m.id, { muted: false })).toHaveLength(1);
  });
});

describe("[P1-04] memberships: what a shop's team may change (P1-A close, security review SEC-M1)", () => {
  /** A staff member of a fresh shop who is also a member there, plus another member of that shop. */
  async function teamWorld() {
    const [shop, otherShop, staffer, member, someoneElse] = await Promise.all([
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
      makeUser(),
      makeUser(),
      makeUser(),
    ]);
    await makeStaff(shop.id, staffer.id, "staff");
    const [stafferOwn, memberRow] = await Promise.all([
      makeMembership(staffer.id, shop.id),
      makeMembership(member.id, shop.id),
    ]);
    return {
      shop,
      otherShop,
      staffer,
      stafferOwn,
      memberRow,
      someoneElse,
      staff: mintShopScope({ userId: staffer.id, shopId: shop.id, role: "staff" }),
    };
  }

  it("refuses staff changing identity, dates, consent, mute or leave on a member of their own shop", async () => {
    const t = await teamWorld();
    for (const set of [
      { userId: t.someoneElse.id },
      { joinedAt: new Date("2020-01-01T00:00:00Z") },
      { createdAt: new Date("2020-01-01T00:00:00Z") },
      { marketingOptIn: true },
      { muted: true },
      { leftAt: new Date() },
      { purchaseCount: 2, marketingOptIn: true },
      // P1-07 (0025): the loyalty counters stay with the approval flow (P1-12), not a staff write.
      { progressGold: 500 },
      { ingotsCompleted: 1 },
      // P1-12 (0029): no loyalty-state write without a ledger entry in the same transaction.
      { goldShortfall: 0, tier: "gold" as const },
      { streakWeeks: 9 },
      { milestonesReached: [50] },
      { ingotStartedAt: new Date() },
    ] satisfies Partial<typeof memberships.$inferInsert>[]) {
      expect(await pgCode(() => update(t.staff, t.memberRow.id, set)), JSON.stringify(set)).toBe(
        DENIED,
      );
    }
    const [row] = await db().select().from(memberships).where(eq(memberships.id, t.memberRow.id));
    expect(row).toMatchObject({ muted: false, leftAt: null, purchaseCount: 0 });
    expect(row?.marketingOptIn).not.toBe(true);
  });

  it("refuses staff changing the visit counters of a member of their own shop outside an approval (P1-12)", async () => {
    const t = await teamWorld();
    const at = new Date("2026-11-18T12:00:00Z");
    expect(
      await pgCode(() => update(t.staff, t.memberRow.id, { purchaseCount: 4, lastVisitAt: at })),
    ).toBe(DENIED);
  });

  it("refuses staff raising the counters on their own membership of their own shop (no self-award)", async () => {
    const t = await teamWorld();
    expect(await pgCode(() => update(t.staff, t.stafferOwn.id, { purchaseCount: 50 }))).toBe(
      DENIED,
    );
    expect(await pgCode(() => update(t.staff, t.stafferOwn.id, { lastVisitAt: new Date() }))).toBe(
      DENIED,
    );
    // Their own membership is still theirs to mute or leave, as for any customer.
    expect(await update(t.staff, t.stafferOwn.id, { muted: true })).toHaveLength(1);
  });

  it("puts staff joining their own shop through the same server-owned-column checks as a customer", async () => {
    const t = await teamWorld();
    const newcomer = await makeUser();
    await makeStaff(t.otherShop.id, newcomer.id, "staff");
    const scope = mintShopScope({ userId: newcomer.id, shopId: t.otherShop.id, role: "staff" });
    const join = (over: Partial<typeof memberships.$inferInsert>) =>
      withScope(scope, (q) =>
        q
          .insert(memberships)
          .values({ userId: newcomer.id, shopId: t.otherShop.id, ...over })
          .returning({ id: memberships.id }),
      );
    for (const over of [
      { purchaseCount: 500 },
      { lastVisitAt: new Date() },
      { joinedAt: new Date("2020-01-01T00:00:00Z") },
    ] satisfies Partial<typeof memberships.$inferInsert>[]) {
      expect(await pgCode(() => join(over)), JSON.stringify(over)).toBe(DENIED);
    }
    expect(await join({})).toHaveLength(1);
  });
});
