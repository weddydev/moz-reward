import { eq, type SQL, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope, type Scope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { memberships, pointRequests } from "@/server/db/schema";
import { transaction, withScope } from "@/server/repos/_base";
import { reverseAward } from "@/server/services/approvals";
import { claimCelebration } from "@/server/services/celebrations";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-15 celebrations (DESIGN §8.2; drizzle/0033): an approval keeps the ingot before and after it, and the
 * customer's app claims each approval's moment once (server-side `seen_at`). The claim's rules (newest, window,
 * left shop, reversal) and the database walls under the web role, with no service code in between.
 */
const DENIED = "42501";
const CHECK = "23514";

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function world(progressGold = 0) {
  const [shop, otherShop, ownerUser, customer, stranger] = await Promise.all([
    makeShop({ status: "active", name: "Brew & Bloom Café" }),
    makeShop({ status: "active", name: "Other Shop" }),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeProgramme(shop.id, 1_000, { milestones: [], streak: null }),
    makeProgramme(otherShop.id, 1_000, { milestones: [], streak: null }),
  ]);
  const [member, strangerMember] = await Promise.all([
    makeMembership(customer.id, shop.id, { progressGold }),
    makeMembership(stranger.id, shop.id),
  ]);
  return {
    shop,
    otherShop,
    member,
    strangerMember,
    customer: mintCustomerScope({ userId: customer.id }),
    stranger: mintCustomerScope({ userId: stranger.id }),
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
  };
}

type World = Awaited<ReturnType<typeof world>>;
let w: World;
beforeEach(async () => {
  w = await world();
});

const requestRow = async (id: string) => {
  const [row] = await db().select().from(pointRequests).where(eq(pointRequests.id, id));
  if (!row) throw new Error("no request");
  return row;
};

const asScope = (scope: Scope, statement: SQL) => withScope(scope, (q) => q.execute(statement));

describe("[P1-15] the approval's ingot snapshot", () => {
  it("[P1-15] records the ingot before and after the award, and the ingot's size", async () => {
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    const row = await requestRow(approved.requestId);
    expect(row).toMatchObject({ progressBefore: 0, progressAfter: 100, ingotSize: 1_000 });
    expect(row.seenAt).toBeNull();
  });

  it("[P1-15] a fill records the level in the next ingot after it", async () => {
    w = await world(950);
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    expect(approved.rewardIds).toHaveLength(1);
    expect(await requestRow(approved.requestId)).toMatchObject({
      progressBefore: 950,
      progressAfter: 50,
      ingotSize: 1_000,
    });
  });
});

describe("[P1-15] claimCelebration", () => {
  it("[P1-15] returns the moment once: a second claim (another tab, a reload) gets nothing", async () => {
    const approved = await approvedVisit(w.member, { amountPence: 840, items: ["Flat white"] });
    const first = await claimCelebration(w.customer);
    expect(first).toMatchObject({
      requestId: approved.requestId,
      shop: { id: w.shop.id, name: "Brew & Bloom Café", code: w.shop.shopCode },
      gold: 100,
      amountPence: 840,
      ingot: { from: 0, to: 100, size: 1_000, ingotsBefore: 0, filled: 0 },
      title: "Free drink of your choice",
      perVisit: 100,
      rewards: [],
      receipt: {
        id: approved.receiptId,
        number: approved.receiptNumber,
        shopName: "Brew & Bloom Café",
        items: ["Flat white"],
        amountPence: 840,
        goldEarned: 100,
        bonusGold: 0,
      },
    });
    expect((await requestRow(approved.requestId)).seenAt).not.toBeNull();
    expect(await claimCelebration(w.customer)).toBeNull();
  });

  it("[P1-15] gold per £1: no visit estimate (perVisit null); the amount drives the gold", async () => {
    const [shop, ownerUser, customer] = await Promise.all([
      makeShop({ status: "active", name: "Pedal & Co." }),
      makeUser(),
      makeUser(),
    ]);
    await Promise.all([
      makeStaff(shop.id, ownerUser.id, "owner"),
      makeProgramme(shop.id, 1_000, {
        earnMode: "per_pound",
        earnRate: 10,
        milestones: [],
        streak: null,
      }),
    ]);
    const member = await makeMembership(customer.id, shop.id);
    await approvedVisit(member, { amountPence: 1_250 });
    const moment = await claimCelebration(mintCustomerScope({ userId: customer.id }));
    expect(moment).toMatchObject({
      gold: 125, // 10 gold per £1 on £12.50
      perVisit: null,
      ingot: { from: 0, to: 125, size: 1_000 },
    });
  });

  it("[P1-15] two claims racing (two tabs): exactly one gets the moment", async () => {
    await approvedVisit(w.member, { amountPence: 840 });
    const results = await Promise.all([
      claimCelebration(w.customer),
      claimCelebration(w.customer),
      claimCelebration(w.customer),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("[P1-15] a fill chains into the reward: the unlocked reward and the ingot count come with it", async () => {
    w = await world(950);
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    const moment = await claimCelebration(w.customer);
    expect(moment?.ingot).toEqual({ from: 950, to: 50, size: 1_000, ingotsBefore: 0, filled: 1 });
    expect(moment?.rewards).toEqual([
      { id: approved.rewardIds[0], label: "Free drink of your choice", kind: "main" },
    ]);
  });

  it("[P1-15] several unseen approvals: the newest plays, all are marked seen", async () => {
    const older = await approvedVisit(w.member, { amountPence: 500, agoMs: 120_000 });
    await db()
      .update(pointRequests)
      .set({ decidedAt: new Date(Date.now() - 60_000) })
      .where(eq(pointRequests.id, older.requestId));
    const newer = await approvedVisit(w.member, { amountPence: 900 });
    const moment = await claimCelebration(w.customer);
    expect(moment?.requestId).toBe(newer.requestId);
    expect((await requestRow(older.requestId)).seenAt).not.toBeNull();
    expect(await claimCelebration(w.customer)).toBeNull();
  });

  it("[P1-15] only the caller's own approvals: another member's stay unseen", async () => {
    const theirs = await approvedVisit(w.strangerMember, { amountPence: 840 });
    expect(await claimCelebration(w.customer)).toBeNull();
    expect((await requestRow(theirs.requestId)).seenAt).toBeNull();
    expect((await claimCelebration(w.stranger))?.requestId).toBe(theirs.requestId);
  });

  it("[P1-15] older than the 7-day window: claimed, not replayed", async () => {
    const old = await approvedVisit(w.member, { amountPence: 840 });
    await db()
      .update(pointRequests)
      .set({ decidedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1_000) })
      .where(eq(pointRequests.id, old.requestId));
    expect(await claimCelebration(w.customer)).toBeNull();
    expect((await requestRow(old.requestId)).seenAt).not.toBeNull();
  });

  it("[P1-15] a reversed award is not celebrated (an older one still can be)", async () => {
    const kept = await approvedVisit(w.member, { amountPence: 500, agoMs: 120_000 });
    await db()
      .update(pointRequests)
      .set({ decidedAt: new Date(Date.now() - 60_000) })
      .where(eq(pointRequests.id, kept.requestId));
    const undone = await approvedVisit(w.member, { amountPence: 840 });
    await transaction(w.owner, (tx) =>
      reverseAward(w.owner, { receiptId: undone.receiptId, reason: "mistake" }, tx),
    );
    expect((await claimCelebration(w.customer))?.requestId).toBe(kept.requestId);
  });

  it("[P1-15] after leaving the shop: claimed, not celebrated", async () => {
    await approvedVisit(w.member, { amountPence: 840 });
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, w.member.id));
    expect(await claimCelebration(w.customer)).toBeNull();
  });

  it("[P1-15] an approval without a snapshot (before 0033, seeded rows) is claimed, not celebrated", async () => {
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    await db()
      .update(pointRequests)
      .set({ progressBefore: null, progressAfter: null, ingotSize: null })
      .where(eq(pointRequests.id, approved.requestId));
    expect(await claimCelebration(w.customer)).toBeNull();
    expect((await requestRow(approved.requestId)).seenAt).not.toBeNull();
  });
});

describe("[P1-15] database walls (web role)", () => {
  const seen = (id: string, extra: SQL = sql``) =>
    sql`UPDATE point_requests SET seen_at = now(), updated_at = now() ${extra} WHERE id = ${id} RETURNING id`;
  const rows = (r: unknown): number =>
    Array.isArray(r) ? r.length : ((r as { rows?: unknown[] }).rows?.length ?? 0);

  it("[P1-15] the member marks their own approval seen once; a second update finds no row", async () => {
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    expect(rows(await asScope(w.customer, seen(approved.requestId)))).toBe(1);
    expect(rows(await asScope(w.customer, seen(approved.requestId)))).toBe(0);
  });

  it("[P1-15] another customer can't mark it seen (no row), nor can the member change anything else", async () => {
    const approved = await approvedVisit(w.member, { amountPence: 840 });
    expect(rows(await asScope(w.stranger, seen(approved.requestId)))).toBe(0);
    expect(
      await pgCode(() => asScope(w.customer, seen(approved.requestId, sql`, award_gold = 5000`))),
    ).toBe(DENIED);
    expect(
      await pgCode(() =>
        asScope(
          w.customer,
          sql`UPDATE point_requests SET seen_at = now() - interval '1 day' WHERE id = ${approved.requestId}`,
        ),
      ),
    ).toBe(DENIED);
    expect((await requestRow(approved.requestId)).seenAt).toBeNull();
  });

  it("[P1-15] a pending request can't be marked seen; the team can't mark anything seen", async () => {
    const [pending] = await db()
      .insert(pointRequests)
      .values({
        membershipId: w.member.id,
        userId: w.member.userId,
        shopId: w.member.shopId,
        idempotencyKey: newId(),
      })
      .returning({ id: pointRequests.id });
    if (!pending) throw new Error("no request");
    // Visible to the member (their cancel policy), so the guard answers: only an approval can be marked seen.
    expect(await pgCode(() => asScope(w.customer, seen(pending.id)))).toBe(DENIED);
    const approved = await approvedVisit(w.strangerMember, { amountPence: 840 });
    expect(await pgCode(() => asScope(w.owner, seen(approved.requestId)))).toBe(DENIED);
  });

  it("[P1-15] a new request can't carry a snapshot or a seen time", async () => {
    const insert = (cols: SQL) =>
      sql`INSERT INTO point_requests (id, membership_id, user_id, shop_id, idempotency_key, ${cols})
          VALUES (${newId()}, ${w.member.id}, ${w.member.userId}, ${w.member.shopId}, ${newId()}, `;
    expect(await pgCode(() => asScope(w.customer, sql`${insert(sql`seen_at`)}now())`))).toBe(
      DENIED,
    );
    expect(
      await pgCode(() =>
        asScope(
          w.customer,
          sql`${insert(sql`progress_before, progress_after, ingot_size`)}0, 10, 1000)`,
        ),
      ),
    ).toBe(DENIED);
  });

  it("[P1-15] the team's approval must carry the snapshot; a rejection must not", async () => {
    const make = async () => {
      const [r] = await db()
        .insert(pointRequests)
        .values({
          membershipId: w.member.id,
          userId: w.member.userId,
          shopId: w.member.shopId,
          idempotencyKey: newId(),
          requestedAt: new Date(Date.now() - 60_000),
        })
        .returning({ id: pointRequests.id });
      if (!r) throw new Error("no request");
      return r.id;
    };
    const decide = (id: string, set: SQL) =>
      sql`UPDATE point_requests SET ${set}, decided_by = ${w.owner.userId}, decided_at = now() WHERE id = ${id}`;
    const a = await make();
    expect(
      await pgCode(() => asScope(w.owner, decide(a, sql`status = 'approved', award_gold = 10`))),
    ).toBe(CHECK);
    expect(
      await pgCode(() =>
        asScope(
          w.owner,
          decide(
            a,
            sql`status = 'rejected', reject_reason = 'other', progress_before = 0, progress_after = 0, ingot_size = 1000`,
          ),
        ),
      ),
    ).toBe(CHECK);
    expect(
      await pgCode(() =>
        asScope(
          w.owner,
          decide(
            a,
            sql`status = 'approved', award_gold = 10, progress_before = 0, progress_after = 10, ingot_size = 0`,
          ),
        ),
      ),
    ).toBe(CHECK);
  });
});
