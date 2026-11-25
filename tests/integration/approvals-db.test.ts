import { eq, type SQL, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import {
  mintAdminScope,
  mintShopScope,
  type Scope,
  type ShopScope,
  systemScope,
} from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { contentSettings, ledgerEntries, pointRequests, receipts } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import {
  makeAdmin,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P1-12 database walls (drizzle/0029; design check 26 Nov). Every write here runs as the web role (moz_app) in
 * a scope, with no service code in between, so each test proves the database refuses on its own: self-award,
 * the staff limit, owner-only decisions, the platform cap, the 24 h window, append-only ledger, the ledger ↔
 * approval tie, reversal authority, rewards and receipts only beside an approval, gapless receipt numbers.
 * The approval service's own behaviour is in approvals.test.ts.
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
const CHECK = "23514";
const APPEND_ONLY = "23001";
const UNIQUE = "23505";
const INTEGRITY = "23000";

type World = Awaited<ReturnType<typeof world>>;

async function world() {
  const [shop, otherShop, ownerUser, stafferUser, customer, outsider] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeStaff(shop.id, stafferUser.id, "staff", { perAwardLimit: 200 }),
    makeStaff(otherShop.id, outsider.id, "staff", { perAwardLimit: 200 }),
  ]);
  const [member, stafferOwn, ownerOwn] = await Promise.all([
    makeMembership(customer.id, shop.id),
    makeMembership(stafferUser.id, shop.id),
    makeMembership(ownerUser.id, shop.id),
  ]);
  return {
    shop,
    member,
    stafferOwn,
    ownerOwn,
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: stafferUser.id, shopId: shop.id, role: "staff" }),
    outsider: mintShopScope({ userId: outsider.id, shopId: otherShop.id, role: "staff" }),
  };
}

let w: World;
beforeEach(async () => {
  w = await world();
});

type Membership = World["member"];

/** A pending request of `m`, written as the owner role (the member's own insert path is P1-11's). */
async function request(m: Membership, over: Partial<typeof pointRequests.$inferInsert> = {}) {
  const [row] = await db()
    .insert(pointRequests)
    .values({
      membershipId: m.id,
      userId: m.userId,
      shopId: m.shopId,
      idempotencyKey: newId(),
      ...over,
    })
    .returning();
  if (!row) throw new Error("no request");
  return row;
}

const run = (scope: Scope, statements: (receiptId: string) => SQL[]) =>
  withScope(scope, async (q) => {
    const receiptId = newId();
    let last: unknown;
    for (const s of statements(receiptId)) last = await q.execute(s);
    return { receiptId, last };
  });

const decide = (id: string, by: string, set: SQL): SQL =>
  sql`UPDATE point_requests SET ${set}, decided_by = ${by}, decided_at = now() WHERE id = ${id} RETURNING id`;

const earn = (m: Membership, requestId: string, by: string, points: number, receiptId: string) =>
  sql`INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, request_id, receipt_id, idempotency_key, created_by)
      VALUES (${newId()}, ${m.id}, ${m.shopId}, 'earn', ${points}, ${requestId}, ${receiptId}, ${`${requestId}:earn`}, ${by})`;

const bumpMember = (m: Membership, gold: number) =>
  sql`UPDATE memberships SET progress_gold = progress_gold + ${gold}, purchase_count = purchase_count + 1,
      last_visit_at = now() WHERE id = ${m.id}`;

const bumpCounter = (shopId: string) =>
  sql`INSERT INTO shop_receipt_counters (shop_id, last_number) VALUES (${shopId}, 1)
      ON CONFLICT (shop_id) DO UPDATE SET last_number = shop_receipt_counters.last_number + 1`;

const receipt = (
  m: Membership,
  requestId: string,
  by: string,
  receiptId: string,
  number?: number,
) =>
  sql`INSERT INTO receipts (id, shop_id, membership_id, request_id, number, data, created_by)
      VALUES (${receiptId}, ${m.shopId}, ${m.id}, ${requestId},
              ${number ?? sql`(SELECT last_number FROM shop_receipt_counters WHERE shop_id = ${m.shopId})`},
              '{}'::jsonb, ${by})`;

/** The whole approval, as the service writes it (the order matters: each guard checks the step before). */
const approval = (scope: ShopScope, m: Membership, requestId: string, gold: number) =>
  run(scope, (rid) => [
    decide(requestId, scope.userId, sql`status = 'approved', award_gold = ${gold}`),
    earn(m, requestId, scope.userId, gold, rid),
    bumpMember(m, gold),
    bumpCounter(m.shopId),
    receipt(m, requestId, scope.userId, rid),
  ]);

const reversal = (scope: ShopScope, m: Membership, receiptId: string, points: number) =>
  run(scope, () => [
    sql`INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, receipt_id, idempotency_key, created_by)
        VALUES (${newId()}, ${m.id}, ${m.shopId}, 'reversal', ${points}, ${receiptId}, ${`${receiptId}:reversal`}, ${scope.userId})`,
    sql`UPDATE memberships SET progress_gold = greatest(progress_gold + ${points}, 0) WHERE id = ${m.id}`,
  ]);

describe("[P1-12] approvals: the database walls on point_requests", () => {
  it("lets staff approve within their limit, once: a second decision is refused (CONFLICT path)", async () => {
    const r = await request(w.member);
    await approval(w.staff, w.member, r.id, 150);
    const [row] = await db().select().from(pointRequests).where(eq(pointRequests.id, r.id));
    expect(row).toMatchObject({ status: "approved", awardGold: 150, decidedBy: w.staff.userId });
    expect(await pgCode(() => approval(w.staff, w.member, r.id, 150))).toBe(DENIED);
    expect(await pgCode(() => approval(w.owner, w.member, r.id, 150))).toBe(DENIED);
  });

  it("refuses a team member deciding their own request (self-award), owners included", async () => {
    const own = await request(w.stafferOwn);
    expect(await pgCode(() => approval(w.staff, w.stafferOwn, own.id, 10))).toBe(DENIED);
    const ownerOwn = await request(w.ownerOwn);
    expect(await pgCode(() => approval(w.owner, w.ownerOwn, ownerOwn.id, 10))).toBe(DENIED);
    expect(
      await pgCode(() =>
        run(w.owner, () => [
          decide(ownerOwn.id, w.owner.userId, sql`status = 'rejected', reject_reason = 'other'`),
        ]),
      ),
    ).toBe(DENIED);
  });

  it("refuses staff approving above their live limit; they route it to the owner, who decides", async () => {
    const r = await request(w.member);
    expect(await pgCode(() => approval(w.staff, w.member, r.id, 201))).toBe(DENIED);
    // Routing within the limit is refused too (it must be approved directly).
    const routeAt = (gold: number) =>
      run(w.staff, () => [
        sql`UPDATE point_requests SET status = 'awaiting_owner', award_gold = ${gold}, amount_pence = 2500,
            routed_by = ${w.staff.userId}, routed_at = now() WHERE id = ${r.id}`,
      ]);
    expect(await pgCode(() => routeAt(150))).toBe(DENIED);
    await routeAt(201);
    expect(await pgCode(() => approval(w.staff, w.member, r.id, 201))).toBe(DENIED);
    expect(
      await pgCode(() =>
        run(w.staff, () => [
          decide(r.id, w.staff.userId, sql`status = 'rejected', reject_reason = 'other'`),
        ]),
      ),
    ).toBe(DENIED);
    await approval(w.owner, w.member, r.id, 250);
    const [row] = await db().select().from(pointRequests).where(eq(pointRequests.id, r.id));
    expect(row).toMatchObject({ status: "approved", routedBy: w.staff.userId, awardGold: 250 });
  });

  it("reads the staff limit live: a lowered limit applies to a session minted before", async () => {
    const r = await request(w.member);
    await db().execute(
      sql`UPDATE shop_staff SET per_award_limit = 50 WHERE user_id = ${w.staff.userId}`,
    );
    expect(await pgCode(() => approval(w.staff, w.member, r.id, 100))).toBe(DENIED);
    await db().execute(sql`UPDATE shop_staff SET active = false WHERE user_id = ${w.staff.userId}`);
    expect(await pgCode(() => approval(w.staff, w.member, r.id, 10))).toBe(DENIED);
  });

  it("refuses any award above the platform cap, even for owners; the cap follows content_settings", async () => {
    const r = await request(w.member);
    expect(await pgCode(() => approval(w.owner, w.member, r.id, 501))).toBe(CHECK);
    const pence = () =>
      run(w.owner, () => [
        decide(
          r.id,
          w.owner.userId,
          sql`status = 'approved', award_gold = 10, amount_pence = 50001`,
        ),
      ]);
    expect(await pgCode(pence)).toBe(CHECK);
    await db()
      .insert(contentSettings)
      .values({ key: "award_cap", value: { pence: 100_000, gold: 1_000 } });
    try {
      await approval(w.owner, w.member, r.id, 600);
    } finally {
      await db().delete(contentSettings).where(eq(contentSettings.key, "award_cap"));
    }
  });

  it("an invalid award_cap value falls back to the default, never to no cap", async () => {
    const r = await request(w.member);
    await db()
      .insert(contentSettings)
      .values({ key: "award_cap", value: { pence: "lots", gold: -1 } });
    try {
      expect(await pgCode(() => approval(w.owner, w.member, r.id, 501))).toBe(CHECK);
    } finally {
      await db().delete(contentSettings).where(eq(contentSettings.key, "award_cap"));
    }
  });

  it("refuses deciding a request 24 h after requested_at", async () => {
    const r = await request(w.member, {
      requestedAt: new Date(Date.now() - 24 * 3_600_000 - 1_000),
    });
    expect(await pgCode(() => approval(w.owner, w.member, r.id, 10))).toBe(DENIED);
  });

  it("another shop's staff can't see or decide the request (RLS: no row)", async () => {
    const r = await request(w.member);
    const { last } = await run(w.outsider, () => [
      decide(r.id, w.outsider.userId, sql`status = 'rejected', reject_reason = 'other'`),
    ]);
    expect([...(last as Iterable<unknown>)]).toHaveLength(0);
    const [row] = await db().select().from(pointRequests).where(eq(pointRequests.id, r.id));
    expect(row?.status).toBe("pending");
  });
});

describe("[P1-12] ledger_entries: append-only, tied to an approval", () => {
  it("refuses UPDATE, DELETE and TRUNCATE for every role, the worker and the owner included", async () => {
    const r = await request(w.member);
    await approval(w.staff, w.member, r.id, 40);
    expect(await pgCode(() => db().execute(sql`UPDATE ledger_entries SET points = 1`))).toBe(
      APPEND_ONLY,
    );
    expect(await pgCode(() => db().execute(sql`DELETE FROM ledger_entries`))).toBe(APPEND_ONLY);
    expect(await pgCode(() => db().execute(sql`TRUNCATE ledger_entries`))).toBe(APPEND_ONLY);
    const worker = systemScope("test: ledger is append-only for the worker");
    expect(
      await pgCode(() => withScope(worker, (q) => q.execute(sql`DELETE FROM ledger_entries`))),
    ).toBe(DENIED);
    expect(
      await pgCode(() =>
        withScope(w.owner, (q) => q.execute(sql`UPDATE ledger_entries SET points = 1`)),
      ),
    ).toBe(DENIED);
  });

  it("refuses gold without an approval by this user in this transaction, or above the approved award", async () => {
    const r = await request(w.member);
    expect(
      await pgCode(() => run(w.staff, (rid) => [earn(w.member, r.id, w.staff.userId, 10, rid)])),
    ).toBe(DENIED);
    expect(
      await pgCode(() =>
        run(w.staff, (rid) => [
          decide(r.id, w.staff.userId, sql`status = 'approved', award_gold = 50`),
          earn(w.member, r.id, w.staff.userId, 51, rid),
        ]),
      ),
    ).toBe(DENIED);
    // A forged creator: the row must name the writer.
    expect(
      await pgCode(() =>
        run(w.staff, (rid) => [
          decide(r.id, w.staff.userId, sql`status = 'approved', award_gold = 50`),
          earn(w.member, r.id, w.owner.userId, 50, rid),
        ]),
      ),
    ).toBe(DENIED);
  });

  it("refuses ledger rows for the writer's own membership, and types the web role never writes", async () => {
    const r = await request(w.member);
    expect(
      await pgCode(() =>
        run(w.staff, (rid) => [earn(w.stafferOwn, r.id, w.staff.userId, 10, rid)]),
      ),
    ).toBe(DENIED);
    expect(
      await pgCode(() =>
        withScope(w.owner, (q) =>
          q.insert(ledgerEntries).values({
            membershipId: w.member.id,
            shopId: w.shop.id,
            type: "adjustment",
            points: 500,
            idempotencyKey: `adjust:${newId()}`,
            createdBy: w.owner.userId,
          }),
        ),
      ),
    ).toBe(DENIED);
  });

  it("membership progress moves only beside the writer's ledger row in the same transaction", async () => {
    expect(await pgCode(() => run(w.staff, () => [bumpMember(w.member, 10)]))).toBe(DENIED);
  });
});

describe("[P1-12] reversals: owner, or the approver within 15 minutes, exactly once", () => {
  it("lets the approver reverse exactly the receipt's gold; a second reversal is a conflict", async () => {
    const r = await request(w.member);
    const { receiptId } = await approval(w.staff, w.member, r.id, 120);
    expect(await pgCode(() => reversal(w.staff, w.member, receiptId, -100))).toBe(DENIED);
    await reversal(w.staff, w.member, receiptId, -120);
    expect(await pgCode(() => reversal(w.owner, w.member, receiptId, -120))).toBe(UNIQUE);
  });

  it("refuses another staff member, and the approver after 15 minutes; the owner may still reverse", async () => {
    const r = await request(w.member);
    const { receiptId } = await approval(w.owner, w.member, r.id, 80);
    expect(await pgCode(() => reversal(w.staff, w.member, receiptId, -80))).toBe(DENIED);
    const r2 = await request(w.member);
    const second = await approval(w.staff, w.member, r2.id, 30);
    await db()
      .update(receipts)
      .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
      .where(eq(receipts.id, second.receiptId));
    expect(await pgCode(() => reversal(w.staff, w.member, second.receiptId, -30))).toBe(DENIED);
    await reversal(w.owner, w.member, second.receiptId, -30);
  });
});

describe("[P1-12] rewards and receipts: only beside an approval; numbers gapless per shop", () => {
  it("refuses a reward without this user's earn row in the transaction", async () => {
    const r = await request(w.member);
    const reward = sql`INSERT INTO rewards (id, membership_id, shop_id, kind, label, ingot_number, rewards_version, request_id)
      VALUES (${newId()}, ${w.member.id}, ${w.shop.id}, 'main', 'Free coffee', 1, 1, ${r.id})`;
    expect(await pgCode(() => run(w.owner, () => [reward]))).toBe(DENIED);
    await run(w.owner, (rid) => [
      decide(r.id, w.owner.userId, sql`status = 'approved', award_gold = 100`),
      earn(w.member, r.id, w.owner.userId, 100, rid),
      bumpMember(w.member, 100),
      reward,
      bumpCounter(w.shop.id),
      receipt(w.member, r.id, w.owner.userId, rid),
    ]);
  });

  it("numbers receipts 1, 2, 3 per shop; a number that isn't the counter's is refused", async () => {
    for (let i = 0; i < 3; i++) await approval(w.owner, w.member, (await request(w.member)).id, 10);
    const numbers = await db()
      .select({ n: receipts.number })
      .from(receipts)
      .where(eq(receipts.shopId, w.shop.id))
      .orderBy(receipts.number);
    expect(numbers.map((x) => x.n)).toEqual([1, 2, 3]);
    const r = await request(w.member);
    expect(
      await pgCode(() =>
        run(w.owner, (rid) => [
          decide(r.id, w.owner.userId, sql`status = 'approved', award_gold = 10`),
          earn(w.member, r.id, w.owner.userId, 10, rid),
          bumpCounter(w.shop.id),
          receipt(w.member, r.id, w.owner.userId, rid, 9),
        ]),
      ),
    ).toBe(DENIED);
  });

  it("refuses a counter that jumps, and a counter moved without its receipt (checked at commit)", async () => {
    await approval(w.owner, w.member, (await request(w.member)).id, 10);
    expect(
      await pgCode(() =>
        run(w.owner, () => [
          sql`UPDATE shop_receipt_counters SET last_number = last_number + 2 WHERE shop_id = ${w.shop.id}`,
        ]),
      ),
    ).toBe(DENIED);
    expect(await pgCode(() => run(w.owner, () => [bumpCounter(w.shop.id)]))).toBe(INTEGRITY);
  });

  it("concurrent approvals in one shop get unique, gapless numbers", async () => {
    const members = await Promise.all(
      Array.from({ length: 12 }, async () => makeMembership((await makeUser()).id, w.shop.id)),
    );
    const requests = await Promise.all(members.map((m) => request(m)));
    await Promise.all(members.map((m, i) => approval(w.owner, m, requests[i]?.id ?? "", 10)));
    const numbers = await db()
      .select({ n: receipts.number })
      .from(receipts)
      .where(eq(receipts.shopId, w.shop.id))
      .orderBy(receipts.number);
    expect(numbers.map((x) => x.n)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe("[P1-12] award_cap and fraud_flags: who may write", () => {
  it("only the admin owner writes award_cap; a moderator keeps the other keys", async () => {
    const [ownerUser, modUser] = await Promise.all([makeUser(), makeUser()]);
    await Promise.all([makeAdmin(ownerUser.id, "owner"), makeAdmin(modUser.id, "moderator")]);
    const asAdmin = (userId: string, role: "owner" | "moderator", s: SQL) =>
      withScope(mintAdminScope({ userId, role }), (q) => q.execute(s));
    const setCap = sql`INSERT INTO content_settings (key, value) VALUES ('award_cap', '{"pence": 60000, "gold": 600}')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    expect(await pgCode(() => asAdmin(modUser.id, "moderator", setCap))).toBe(DENIED);
    await asAdmin(ownerUser.id, "owner", setCap);
    // A moderator's UPDATE or DELETE can't even see the row (RESTRICTIVE USING): nothing changes.
    const touched = await asAdmin(
      modUser.id,
      "moderator",
      sql`UPDATE content_settings SET value = '{}' WHERE key = 'award_cap' RETURNING key`,
    );
    expect([...touched]).toHaveLength(0);
    const removed = await asAdmin(
      modUser.id,
      "moderator",
      sql`DELETE FROM content_settings WHERE key = 'award_cap' RETURNING key`,
    );
    expect([...removed]).toHaveLength(0);
    await asAdmin(
      modUser.id,
      "moderator",
      sql`INSERT INTO content_settings (key, value) VALUES (${`probe_${newId().slice(0, 8)}`}, '[]')`,
    );
    const [cap] = await db()
      .select()
      .from(contentSettings)
      .where(eq(contentSettings.key, "award_cap"));
    expect(cap?.value).toEqual({ pence: 60000, gold: 600 });
    await db().delete(contentSettings).where(eq(contentSettings.key, "award_cap"));
  });

  it("the web role can't write fraud flags", async () => {
    expect(
      await pgCode(() =>
        withScope(w.owner, (q) =>
          q.execute(
            sql`INSERT INTO fraud_flags (id, rule, entity, entity_id) VALUES (${newId()}, 'x', 'receipt', ${newId()})`,
          ),
        ),
      ),
    ).toBe(DENIED);
  });
});
