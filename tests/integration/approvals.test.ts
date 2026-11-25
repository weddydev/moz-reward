import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { addDays, londonWeekStart } from "@/lib/time";
import { mintShopScope, type ShopScope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import {
  auditLogs,
  contentSettings,
  ledgerEntries,
  loyaltyPrograms,
  memberships,
  notifications,
  outbox,
  pointRequests,
  receipts,
  rewards,
  shopStaff,
  users,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { transaction } from "@/server/repos/_base";
import {
  ALREADY_DECIDED,
  ALREADY_REVERSED,
  AMOUNT_REQUIRED,
  approveRequest,
  MEMBER_LEFT,
  NO_GOLD,
  NOT_ON_TEAM,
  OWNER_ONLY,
  ownerApprove,
  rejectRequest,
  REQUEST_EXPIRED,
  REVERSAL_TOO_LATE,
  reverseAward,
  SELF_AWARD,
} from "@/server/services/approvals";
import { expirePointRequests } from "@/server/services/point-request-jobs";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P1-12 approvals service (PRODUCT §5, §6, §11): approve, owner approval, reject and reverse, as the shop's team,
 * against the real database (0029's guards run under every call). The walls on their own are in
 * approvals-db.test.ts.
 */

type Membership = typeof memberships.$inferSelect;

async function world(programme: Parameters<typeof makeProgramme>[2] = {}) {
  const [shop, ownerUser, stafferUser, otherStafferUser, customer] = await Promise.all([
    makeShop({ status: "active", name: "Bean There", addressLine1: "1 High St", town: "Leeds" }),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await db().update(users).set({ name: "Sam Lee" }).where(eq(users.id, stafferUser.id));
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeStaff(shop.id, stafferUser.id, "staff", { perAwardLimit: 200 }),
    makeStaff(shop.id, otherStafferUser.id, "staff", { perAwardLimit: 200 }),
    makeProgramme(shop.id, 1_000, programme),
  ]);
  const member = await makeMembership(customer.id, shop.id);
  return {
    shop,
    member,
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: stafferUser.id, shopId: shop.id, role: "staff" }),
    otherStaff: mintShopScope({ userId: otherStafferUser.id, shopId: shop.id, role: "staff" }),
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** A pending request of `m`, requested `ago` ms before now (written as the table owner). */
async function request(m: Membership, ago = 60_000) {
  const [row] = await db()
    .insert(pointRequests)
    .values({
      membershipId: m.id,
      userId: m.userId,
      shopId: m.shopId,
      idempotencyKey: newId(),
      requestedAt: new Date(Date.now() - ago),
    })
    .returning();
  if (!row) throw new Error("no request");
  return row;
}

const approve = (scope: ShopScope, input: Parameters<typeof approveRequest>[1]) =>
  transaction(scope, (tx) => approveRequest(scope, input, tx));
const approveAsOwner = (scope: ShopScope, input: Parameters<typeof ownerApprove>[1]) =>
  transaction(scope, (tx) => ownerApprove(scope, input, tx));
const reject = (scope: ShopScope, input: Parameters<typeof rejectRequest>[1]) =>
  transaction(scope, (tx) => rejectRequest(scope, input, tx));
const reverse = (scope: ShopScope, input: Parameters<typeof reverseAward>[1]) =>
  transaction(scope, (tx) => reverseAward(scope, input, tx));

async function failure(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
  } catch (err) {
    if (err instanceof AppError) return { code: err.code, message: err.message };
    throw err;
  }
  throw new Error("expected a failure");
}

const membershipRow = async (id: string) => {
  const [row] = await db().select().from(memberships).where(eq(memberships.id, id));
  if (!row) throw new Error("no membership");
  return row;
};
const requestRow = async (id: string) => {
  const [row] = await db().select().from(pointRequests).where(eq(pointRequests.id, id));
  if (!row) throw new Error("no request");
  return row;
};
const ledgerOf = (membershipId: string) =>
  db()
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.membershipId, membershipId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.type));
const rewardsOf = (membershipId: string) =>
  db()
    .select()
    .from(rewards)
    .where(eq(rewards.membershipId, membershipId))
    .orderBy(asc(rewards.ingotNumber), asc(rewards.kind));
const noticesOf = (userId: string, type: string) =>
  db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
const auditOf = (entityId: string) =>
  db().select().from(auditLogs).where(eq(auditLogs.entityId, entityId));
const hintsFor = async (shopId: string) =>
  (
    await db()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(and(eq(outbox.queue, "notifications"), eq(outbox.scopeShopId, shopId)))
  ).map(
    (r) =>
      (r.payload as { data: { event: { type: string; data: Record<string, unknown> } } }).data
        .event,
  );

let w: World;
beforeEach(async () => {
  w = await world();
});

describe("[P1-12] approve", () => {
  it("[P1-12] writes the request, ledger, membership, receipt, notice, hints and audit in one transaction", async () => {
    const r = await request(w.member);
    const res = await approve(w.staff, {
      requestId: r.id,
      amountPence: 450,
      items: [" Flat white ", "", "Croissant"],
    });
    expect(res).toMatchObject({ outcome: "approved", gold: 100, bonusGold: 0, receiptNumber: 1 });
    if (res.outcome !== "approved") throw new Error("not approved");

    const req = await requestRow(r.id);
    expect(req).toMatchObject({
      status: "approved",
      decidedBy: w.staff.userId,
      awardGold: 100,
      amountPence: 450,
      items: ["Flat white", "Croissant"],
    });
    const ledger = await ledgerOf(w.member.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      type: "earn",
      points: 100,
      programVersion: 1,
      requestId: r.id,
      receiptId: res.receiptId,
      idempotencyKey: `${r.id}:earn`,
      createdBy: w.staff.userId,
    });
    const m = await membershipRow(w.member.id);
    expect(m).toMatchObject({
      progressGold: 100,
      purchaseCount: 1,
      ingotsCompleted: 0,
      streakWeeks: 1,
    });
    expect(m.lastVisitAt?.getTime()).toBe(r.requestedAt.getTime());
    expect(m.ingotStartedAt?.getTime()).toBe(w.member.joinedAt.getTime());

    const [rc] = await db().select().from(receipts).where(eq(receipts.id, res.receiptId));
    expect(rc).toMatchObject({
      number: 1,
      requestId: r.id,
      membershipId: w.member.id,
      pdfKey: null,
    });
    expect(rc?.data).toMatchObject({
      shopName: "Bean There",
      address: "1 High St, Leeds",
      vatNumber: null,
      items: ["Flat white", "Croissant"],
      amountPence: 450,
      goldEarned: 100,
      bonusGold: 0,
      staffInitials: "SL",
    });
    expect(JSON.stringify(rc?.data)).not.toContain(w.member.userId);

    const [notice] = await noticesOf(w.member.userId, "request_approved");
    expect(notice?.payload).toEqual({
      shopId: w.shop.id,
      requestId: r.id,
      receiptId: res.receiptId,
      receiptNumber: 1,
      gold: 100,
    });
    const hints = (await hintsFor(w.shop.id)).map((e) => e.type);
    expect(hints).toEqual(
      expect.arrayContaining(["request_decided", "points_credited", "notification"]),
    );
    const [entry] = await auditOf(r.id);
    expect(entry).toMatchObject({ action: "point_request.approve", actorId: w.staff.userId });
    expect(entry?.meta).toMatchObject({ receiptNumber: 1, gold: 100 });
  });

  it("[P1-12] approving twice → CONFLICT, and two concurrent approvals give one award", async () => {
    const r = await request(w.member);
    await approve(w.staff, { requestId: r.id });
    expect(await failure(() => approve(w.owner, { requestId: r.id }))).toEqual({
      code: "CONFLICT",
      message: ALREADY_DECIDED,
    });

    const r2 = await request(w.member, 30_000);
    const results = await Promise.allSettled([
      approve(w.staff, { requestId: r2.id }),
      approve(w.otherStaff, { requestId: r2.id }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((x) => x.status === "rejected");
    expect((lost as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    const ledger = await ledgerOf(w.member.id);
    expect(ledger.filter((l) => l.requestId === r2.id)).toHaveLength(1);
    expect((await membershipRow(w.member.id)).purchaseCount).toBe(2);
  });

  it("[P1-12] refuses a self-award for staff and owners alike (their own customer account)", async () => {
    for (const scope of [w.staff, w.owner]) {
      const own = await makeMembership(scope.userId, w.shop.id);
      const r = await request(own);
      expect(await failure(() => approve(scope, { requestId: r.id }))).toEqual({
        code: "FORBIDDEN",
        message: SELF_AWARD,
      });
      expect((await requestRow(r.id)).status).toBe("pending");
      expect(await ledgerOf(own.id)).toEqual([]);
    }
  });

  it("[P1-12] rejects an award above the platform cap, even for the owner (amount or gold, whichever first)", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 10 });
    const r = await request(pound.member);
    // £60 at 10 gold per £1 = 600 gold > 500.
    const byGold = await failure(() =>
      approve(pound.owner, { requestId: r.id, amountPence: 6_000 }),
    );
    expect(byGold.code).toBe("LIMIT_REACHED");
    expect(byGold.message).toContain("£500 or 500 gold");
    // £500.01 is over the amount cap even though it would be (with a high cap) fine in gold.
    await db()
      .insert(contentSettings)
      .values({ key: "award_cap", value: { pence: 50_000, gold: 100_000 } })
      .onConflictDoUpdate({
        target: contentSettings.key,
        set: { value: { pence: 50_000, gold: 100_000 } },
      });
    try {
      expect(
        (await failure(() => approve(pound.owner, { requestId: r.id, amountPence: 50_001 }))).code,
      ).toBe("LIMIT_REACHED");
      const ok = await approve(pound.owner, { requestId: r.id, amountPence: 50_000 });
      expect(ok).toMatchObject({ outcome: "approved", gold: 5_000 });
    } finally {
      await db().delete(contentSettings).where(eq(contentSettings.key, "award_cap"));
    }
    expect((await requestRow(r.id)).status).toBe("approved");
  });

  it("[P1-12] a per-pound programme needs the amount; an amount that earns nothing is refused", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 1 });
    const r = await request(pound.member);
    expect(await failure(() => approve(pound.staff, { requestId: r.id }))).toEqual({
      code: "VALIDATION",
      message: AMOUNT_REQUIRED,
    });
    expect(await failure(() => approve(pound.staff, { requestId: r.id, amountPence: 99 }))).toEqual(
      {
        code: "VALIDATION",
        message: NO_GOLD,
      },
    );
    expect((await requestRow(r.id)).status).toBe("pending");
  });

  it("[P1-12] an over-limit staff award waits for the owner; staff can't decide it; the owner approves with an edited amount", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 10 });
    const r = await request(pound.member);
    // £25 = 250 gold > the staff member's 200.
    const routed = await approve(pound.staff, {
      requestId: r.id,
      amountPence: 2_500,
      items: ["Lunch"],
    });
    expect(routed).toEqual({ outcome: "awaiting_owner", requestId: r.id, gold: 250 });
    expect(await requestRow(r.id)).toMatchObject({
      status: "awaiting_owner",
      routedBy: pound.staff.userId,
      amountPence: 2_500,
      items: ["Lunch"],
      awardGold: 250,
      decidedAt: null,
    });
    expect(await ledgerOf(pound.member.id)).toEqual([]);
    const [ownerNotice] = await noticesOf(pound.owner.userId, "request_awaiting_owner");
    expect(ownerNotice?.payload).toEqual({ shopId: pound.shop.id, requestId: r.id, gold: 250 });
    expect(await noticesOf(pound.staff.userId, "request_awaiting_owner")).toEqual([]);

    for (const run of [
      () => approve(pound.staff, { requestId: r.id, amountPence: 1_000 }),
      () => approve(pound.otherStaff, { requestId: r.id, amountPence: 1_000 }),
      () => reject(pound.staff, { requestId: r.id, reason: "no_purchase" }),
      () => approveAsOwner(pound.staff, { requestId: r.id }),
    ]) {
      expect(await failure(run)).toEqual({ code: "FORBIDDEN", message: OWNER_ONLY });
    }

    const done = await approveAsOwner(pound.owner, { requestId: r.id, amountPence: 2_000 });
    expect(done).toMatchObject({ outcome: "approved", gold: 200 });
    expect(await requestRow(r.id)).toMatchObject({
      status: "approved",
      decidedBy: pound.owner.userId,
      routedBy: pound.staff.userId,
      amountPence: 2_000,
      items: ["Lunch"],
    });
  });

  it("[P1-12] the owner approves an awaiting request as entered when no amount is given", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 10 });
    const r = await request(pound.member);
    await approve(pound.staff, { requestId: r.id, amountPence: 2_500 });
    expect(await approveAsOwner(pound.owner, { requestId: r.id })).toMatchObject({ gold: 250 });
    // ownerApprove only decides awaiting requests.
    const r2 = await request(pound.member, 10_000);
    expect(await failure(() => approveAsOwner(pound.owner, { requestId: r2.id }))).toEqual({
      code: "CONFLICT",
      message: ALREADY_DECIDED,
    });
  });

  it("[P1-12] an awaiting request still expires on its original 24 h", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 10 });
    const r = await request(pound.member, 23 * 60 * 60 * 1000);
    await approve(pound.staff, { requestId: r.id, amountPence: 2_500 });
    await db()
      .update(pointRequests)
      .set({ requestedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1_000) })
      .where(eq(pointRequests.id, r.id));
    expect(await failure(() => approveAsOwner(pound.owner, { requestId: r.id }))).toEqual({
      code: "CONFLICT",
      message: REQUEST_EXPIRED,
    });
    await expirePointRequests(systemScope("test: expire the routed request"));
    expect((await requestRow(r.id)).status).toBe("expired");
  });

  it("[P1-12] a request that expired between viewing and approving → CONFLICT, nothing written", async () => {
    const r = await request(w.member, 24 * 60 * 60 * 1000 + 5_000);
    expect(await failure(() => approve(w.staff, { requestId: r.id }))).toEqual({
      code: "CONFLICT",
      message: REQUEST_EXPIRED,
    });
    expect(await ledgerOf(w.member.id)).toEqual([]);
  });

  it("[P1-12] refuses a left membership (progress frozen) and a deactivated staff member", async () => {
    const r = await request(w.member);
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, w.member.id));
    expect(await failure(() => approve(w.owner, { requestId: r.id }))).toEqual({
      code: "CONFLICT",
      message: MEMBER_LEFT,
    });
    await db().update(memberships).set({ leftAt: null }).where(eq(memberships.id, w.member.id));

    await db()
      .update(shopStaff)
      .set({ active: false })
      .where(and(eq(shopStaff.shopId, w.shop.id), eq(shopStaff.userId, w.staff.userId)));
    expect(await failure(() => approve(w.staff, { requestId: r.id }))).toEqual({
      code: "FORBIDDEN",
      message: NOT_ON_TEAM,
    });
    expect((await requestRow(r.id)).status).toBe("pending");
  });

  it("[P1-12] a request of another shop is NOT_FOUND", async () => {
    const other = await world();
    const r = await request(other.member);
    expect((await failure(() => approve(w.owner, { requestId: r.id }))).code).toBe("NOT_FOUND");
    expect((await requestRow(r.id)).status).toBe("pending");
  });

  it("[P1-12] a rolled-back approval sends nothing and frees its receipt number", async () => {
    const r = await request(w.member);
    await expect(
      transaction(w.staff, async (tx) => {
        await approveRequest(w.staff, { requestId: r.id }, tx);
        throw new Error("crash before commit");
      }),
    ).rejects.toThrow("crash before commit");
    expect((await requestRow(r.id)).status).toBe("pending");
    expect(await ledgerOf(w.member.id)).toEqual([]);
    expect(await noticesOf(w.member.userId, "request_approved")).toEqual([]);
    expect(await hintsFor(w.shop.id)).toEqual([]);
    expect(await auditOf(r.id)).toEqual([]);
    expect(await approve(w.staff, { requestId: r.id })).toMatchObject({ receiptNumber: 1 });
  });

  it("[P1-12] receipt numbers are unique and gapless per shop under concurrent approvals", async () => {
    const customers = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    const ms = await Promise.all(customers.map((c) => makeMembership(c.id, w.shop.id)));
    const rs = await Promise.all(ms.map((m) => request(m)));
    const scopes = [w.owner, w.staff, w.otherStaff];
    const results = await Promise.all(
      rs.map((r, i) => approve(scopes[i % scopes.length] as ShopScope, { requestId: r.id })),
    );
    const numbers = results.map((x) => (x.outcome === "approved" ? x.receiptNumber : 0));
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Another shop counts from 1.
    const other = await world();
    const r = await request(other.member);
    expect(await approve(other.staff, { requestId: r.id })).toMatchObject({ receiptNumber: 1 });
  });
});

describe("[P1-12] engine wiring", () => {
  it("[P1-12] the first visit of a week that extends a streak earns the bonus as its own ledger row", async () => {
    const lastWeek = addDays(londonWeekStart(new Date()), -7);
    await db()
      .update(memberships)
      .set({ streakWeeks: 1, streakLastWeekStart: lastWeek })
      .where(eq(memberships.id, w.member.id));
    const r = await request(w.member);
    const res = await approve(w.staff, { requestId: r.id });
    expect(res).toMatchObject({ gold: 150, bonusGold: 50 });
    const ledger = await ledgerOf(w.member.id);
    expect(ledger.map((l) => [l.type, l.points, l.idempotencyKey])).toEqual([
      ["earn", 100, `${r.id}:earn`],
      ["bonus_streak", 50, `${r.id}:bonus_streak`],
    ]);
    expect(await membershipRow(w.member.id)).toMatchObject({ streakWeeks: 2, progressGold: 150 });
  });

  it("[P1-12] milestones and a filled ingot unlock rewards; the next ingot starts at the approval", async () => {
    await db()
      .update(memberships)
      .set({ progressGold: 450 })
      .where(eq(memberships.id, w.member.id));
    const r1 = await request(w.member, 120_000);
    const first = await approve(w.staff, { requestId: r1.id });
    expect(first).toMatchObject({ outcome: "approved" });
    await db()
      .update(memberships)
      .set({ progressGold: 950 })
      .where(eq(memberships.id, w.member.id));
    const r2 = await request(w.member);
    const second = await approve(w.staff, { requestId: r2.id });
    if (second.outcome !== "approved") throw new Error("not approved");
    expect(second.rewardIds).toHaveLength(1);
    const unlocked = await rewardsOf(w.member.id);
    expect(unlocked.map((x) => [x.kind, x.label, x.ingotNumber, x.milestonePercent])).toEqual([
      ["main", "Free drink of your choice", 1, null],
      ["milestone", "Free pastry", 1, 50],
    ]);
    const m = await membershipRow(w.member.id);
    expect(m).toMatchObject({ ingotsCompleted: 1, progressGold: 50, milestonesReached: [] });
    expect(m.ingotStartedAt).not.toBeNull();
    const reward = (await hintsFor(w.shop.id)).filter((e) => e.type === "reward_unlocked");
    expect(reward.map((e) => e.data.rewardId).sort()).toEqual(unlocked.map((x) => x.id).sort());
  });

  it("[P1-12] (C-60) an ingot completes under the terms it started with; earning uses the version at requested_at", async () => {
    const started = new Date("2026-06-01T09:00:00Z");
    await db()
      .update(memberships)
      .set({ progressGold: 950, ingotStartedAt: started })
      .where(eq(memberships.id, w.member.id));
    const savedAt = new Date(Date.now() - 60 * 60 * 1000);
    const [v1] = await db()
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.shopId, w.shop.id));
    if (!v1) throw new Error("no v1");
    const { id: _id, createdAt: _c, ...rest } = v1;
    await db()
      .insert(loyaltyPrograms)
      .values({
        ...rest,
        version: 2,
        earnRate: 200,
        ingotSize: 5_000,
        mainReward: { text: "Free lunch" },
        activeFrom: savedAt,
        rewardsFrom: savedAt,
      });
    const ledgerBefore = await ledgerOf(w.member.id);
    const r = await request(w.member);
    const res = await approve(w.staff, { requestId: r.id });
    // Earned at v2's rate (in force at requested_at); the ingot filled at v1's 1,000 with v1's reward.
    expect(res).toMatchObject({ gold: 200 });
    const unlocked = await rewardsOf(w.member.id);
    expect(unlocked.find((x) => x.kind === "main")).toMatchObject({
      label: "Free drink of your choice",
      rewardsVersion: 1,
      ingotNumber: 1,
    });
    const m = await membershipRow(w.member.id);
    expect(m).toMatchObject({ ingotsCompleted: 1, progressGold: 150 });
    expect(m.ingotStartedAt!.getTime()).toBeGreaterThan(savedAt.getTime());
    expect(ledgerBefore).toEqual([]);
    expect((await ledgerOf(w.member.id))[0]).toMatchObject({ programVersion: 2 });
  });

  it("[P1-12] (C-66) the tier never goes down when an owner raises the thresholds", async () => {
    await db().update(memberships).set({ tier: "gold" }).where(eq(memberships.id, w.member.id));
    const r = await request(w.member);
    await approve(w.staff, { requestId: r.id });
    expect((await membershipRow(w.member.id)).tier).toBe("gold");
  });
});

describe("[P1-12] reject", () => {
  it("[P1-12] stores the reason and note, tells the customer the reason only, and hints the shop and member", async () => {
    const r = await request(w.member);
    await reject(w.staff, {
      requestId: r.id,
      reason: "not_recognised",
      note: "  Not on the till  ",
    });
    expect(await requestRow(r.id)).toMatchObject({
      status: "rejected",
      rejectReason: "not_recognised",
      rejectNote: "Not on the till",
      decidedBy: w.staff.userId,
    });
    const [notice] = await noticesOf(w.member.userId, "request_rejected");
    expect(notice?.payload).toEqual({
      shopId: w.shop.id,
      requestId: r.id,
      reason: "not_recognised",
    });
    const decided = (await hintsFor(w.shop.id)).find((e) => e.type === "request_decided");
    expect(decided?.data).toEqual({ requestId: r.id, shopId: w.shop.id, outcome: "rejected" });
    const [entry] = await auditOf(r.id);
    expect(entry?.meta).toEqual({ reason: "not_recognised", hasNote: true });
    expect(await failure(() => reject(w.owner, { requestId: r.id, reason: "other" }))).toEqual({
      code: "CONFLICT",
      message: ALREADY_DECIDED,
    });
  });

  it("[P1-12] an owner rejects an awaiting request; a blank note is stored as none", async () => {
    const pound = await world({ earnMode: "per_pound", earnRate: 10 });
    const r = await request(pound.member);
    await approve(pound.staff, { requestId: r.id, amountPence: 2_500 });
    await reject(pound.owner, { requestId: r.id, reason: "other", note: "   " });
    expect(await requestRow(r.id)).toMatchObject({ status: "rejected", rejectNote: null });
  });
});

describe("[P1-12] reverse", () => {
  it("[P1-12] takes gold off current progress only, floored at 0; the rest is a shortfall paid off by later earns", async () => {
    await db()
      .update(memberships)
      .set({ progressGold: 950 })
      .where(eq(memberships.id, w.member.id));
    const r = await request(w.member, 120_000);
    const award = await approve(w.staff, { requestId: r.id });
    if (award.outcome !== "approved") throw new Error("not approved");
    // Ingot 1 filled (950 + 100), progress 50, reward unlocked.
    const unlockedBefore = await rewardsOf(w.member.id);
    const res = await reverse(w.staff, {
      receiptId: award.receiptId,
      reason: "mistake",
      note: "Wrong till",
    });
    expect(res).toEqual({
      receiptId: award.receiptId,
      gold: 100,
      fromProgress: 50,
      toShortfall: 50,
      shortfall: 50,
    });
    const m = await membershipRow(w.member.id);
    expect(m).toMatchObject({
      progressGold: 0,
      goldShortfall: 50,
      ingotsCompleted: 1,
      purchaseCount: 1,
    });
    expect(await rewardsOf(w.member.id)).toEqual(unlockedBefore);
    const reversal = (await ledgerOf(w.member.id)).find((l) => l.type === "reversal");
    expect(reversal).toMatchObject({
      points: -100,
      receiptId: award.receiptId,
      idempotencyKey: `${award.receiptId}:reversal`,
      ref: { receiptId: award.receiptId, requestId: r.id, reason: "mistake" },
    });
    const [notice] = await noticesOf(w.member.userId, "award_reversed");
    expect(notice?.payload).toEqual({
      shopId: w.shop.id,
      receiptId: award.receiptId,
      receiptNumber: 1,
      gold: 100,
      shortfall: 50,
      reason: "mistake",
    });
    const [entry] = await auditOf(award.receiptId);
    expect(entry).toMatchObject({ action: "ledger.reverse" });
    expect(entry?.meta).toMatchObject({ reason: "mistake", note: "Wrong till", gold: 100 });

    // The next award pays the shortfall first.
    const r2 = await request(w.member);
    await approve(w.staff, { requestId: r2.id });
    expect(await membershipRow(w.member.id)).toMatchObject({ progressGold: 50, goldShortfall: 0 });
  });

  it("[P1-12] two reversals of one receipt → CONFLICT, also when concurrent", async () => {
    const r = await request(w.member);
    const award = await approve(w.staff, { requestId: r.id });
    if (award.outcome !== "approved") throw new Error("not approved");
    const both = await Promise.allSettled([
      reverse(w.owner, { receiptId: award.receiptId, reason: "refund" }),
      reverse(w.staff, { receiptId: award.receiptId, reason: "refund" }),
    ]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      (both.find((x) => x.status === "rejected") as PromiseRejectedResult).reason,
    ).toMatchObject({
      code: "CONFLICT",
      message: ALREADY_REVERSED,
    });
    expect(
      await failure(() => reverse(w.owner, { receiptId: award.receiptId, reason: "refund" })),
    ).toEqual({
      code: "CONFLICT",
      message: ALREADY_REVERSED,
    });
    expect((await membershipRow(w.member.id)).progressGold).toBe(0);
  });

  it("[P1-12] staff reverse only their own award within 15 min; the owner any time", async () => {
    const r = await request(w.member);
    const award = await approve(w.staff, { requestId: r.id });
    if (award.outcome !== "approved") throw new Error("not approved");
    expect(
      await failure(() => reverse(w.otherStaff, { receiptId: award.receiptId, reason: "refund" })),
    ).toEqual({
      code: "FORBIDDEN",
      message: REVERSAL_TOO_LATE,
    });
    await db()
      .update(receipts)
      .set({ createdAt: sql`now() - interval '16 minutes'` })
      .where(eq(receipts.id, award.receiptId));
    expect(
      await failure(() => reverse(w.staff, { receiptId: award.receiptId, reason: "refund" })),
    ).toEqual({
      code: "FORBIDDEN",
      message: REVERSAL_TOO_LATE,
    });
    expect(await reverse(w.owner, { receiptId: award.receiptId, reason: "refund" })).toMatchObject({
      gold: 100,
    });
  });

  it("[P1-12] a receipt of another shop is NOT_FOUND", async () => {
    const other = await world();
    const r = await request(other.member);
    const award = await approve(other.staff, { requestId: r.id });
    if (award.outcome !== "approved") throw new Error("not approved");
    expect(
      (await failure(() => reverse(w.owner, { receiptId: award.receiptId, reason: "refund" })))
        .code,
    ).toBe("NOT_FOUND");
    expect(
      await db()
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.receiptId, award.receiptId),
            inArray(ledgerEntries.type, ["reversal"]),
          ),
        ),
    ).toEqual([]);
  });
});
