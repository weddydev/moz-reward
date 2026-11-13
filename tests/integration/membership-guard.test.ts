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
 *  (and, if customers may change it, added to `customer_writable` in the trigger). */
const CLASSIFIED = {
  identity: ["id", "user_id", "shop_id"],
  customerWritable: ["muted", "marketing_opt_in", "left_at"],
  dbMaintained: ["updated_at"],
  serverOwned: ["joined_at", "purchase_count", "last_visit_at", "created_at"],
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

  it("lets a customer change muted, marketing_opt_in and left_at on their own membership", async () => {
    const leftAt = new Date("2026-11-13T10:00:00Z");
    expect(
      await update(w.customer, w.own.id, { muted: true, marketingOptIn: true, leftAt }),
    ).toHaveLength(1);
    const [row] = await db().select().from(memberships).where(eq(memberships.id, w.own.id));
    expect(row).toMatchObject({ muted: true, marketingOptIn: true, leftAt });
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
    ] satisfies Partial<typeof memberships.$inferInsert>[]) {
      expect(await pgCode(() => join(over)), JSON.stringify(over)).toBe(DENIED);
    }
    expect(await join({ marketingOptIn: false })).toHaveLength(1);
    await db()
      .delete(memberships)
      .where(and(eq(memberships.userId, w.customerId), eq(memberships.shopId, w.shopB.id)));
  });

  it("lets the shop's own team change counters of its members", async () => {
    const at = new Date("2026-11-13T12:00:00Z");
    expect(
      await update(w.staffA, w.otherInA.id, { purchaseCount: 3, lastVisitAt: at }),
    ).toHaveLength(1);
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
