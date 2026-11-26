import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { mintCustomerScope, mintShopScope, systemScope } from "@/server/authz/scope";
import { dbAs, testOwnerDb as db } from "@/server/db/client";
import { DEMO_SHOPS, type DemoSeedConfig, runDemoSeed } from "@/server/db/demo-seed";
import {
  integrityIssues,
  ledgerEntries,
  memberships,
  pointRequests,
  receipts,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { transaction } from "@/server/repos/_base";
import { purposeKey } from "@/server/security/keys";
import { limiterRedis } from "@/server/security/rate-limit";
import { reverseAward } from "@/server/services/approvals";
import { runIntegrityCheck } from "@/server/services/integrity-job";
import { confirmRedemption, createRedemptionCode } from "@/server/services/redemptions";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-17 data-integrity reconciliation (TESTING §10). Every check clean on real flows (approvals, a reversal, a
 * redemption) and on the demo seed, and finds its deliberately corrupted case (made as the table owner, past the
 * app's walls); open issues are not duplicated, fixed ones resolve, overlapping runs skip, and the run changes
 * no business row. Other tests in this file leave their own rows: assertions name their own entities.
 */
const JOBS = systemScope("integrity-check test");

async function openIssues(entityIds: readonly string[]) {
  if (entityIds.length === 0) return [];
  return db()
    .select()
    .from(integrityIssues)
    .where(
      and(inArray(integrityIssues.entityId, [...entityIds]), isNull(integrityIssues.resolvedAt)),
    );
}

/** A shop with an owner and the Café classic programme; a member one visit from a full ingot. */
async function world() {
  const [shop, ownerUser, customer] = await Promise.all([
    makeShop({ status: "active" }),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([makeStaff(shop.id, ownerUser.id, "owner"), makeProgramme(shop.id, 1_000)]);
  const member = await makeMembership(customer.id, shop.id);
  return {
    shop,
    member,
    customer: mintCustomerScope({ userId: customer.id }),
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
  };
}

let w: Awaited<ReturnType<typeof world>>;
beforeEach(async () => {
  w = await world();
  await limiterRedis().del(`${env().REDIS_KEY_PREFIX}lock:integrity-check`);
});

describe("[P1-17] clean data reads clean", () => {
  it("[P1-17] approvals filling an ingot, a reversal and a redemption leave no issue", async () => {
    for (let i = 0; i < 10; i++) await approvedVisit(w.member, { seen: true });
    const last = await approvedVisit(w.member, { seen: true });
    await transaction(w.owner, (tx) =>
      reverseAward(w.owner, { receiptId: last.receiptId, reason: "mistake" }, tx),
    );
    const [anyReward] = await db().execute<{ id: string }>(
      sql`SELECT id FROM rewards WHERE membership_id = ${w.member.id} ORDER BY unlocked_at LIMIT 1`,
    );
    const code = await transaction(w.customer, (tx) =>
      createRedemptionCode(w.customer, anyReward!.id, tx),
    );
    await confirmRedemption(w.owner, code.code);
    const run = await runIntegrityCheck(JOBS);
    expect(run.skipped).toBe(false);
    expect(await openIssues([w.member.id, w.shop.id, last.requestId])).toEqual([]);
  });

  it("[P1-17] the demo seed reads clean (its counters have an opening balance on the ledger)", async () => {
    const cfg: DemoSeedConfig = {
      key: purposeKey("demo-seed"),
      emailBase: "demo@mozrewards.test",
      authSecret: env().AUTH_SECRET,
    };
    await runDemoSeed(dbAs("system"), cfg);
    const seeded = await db()
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        inArray(
          memberships.shopId,
          DEMO_SHOPS.map((s) => s.id),
        ),
      );
    expect(seeded.length).toBeGreaterThan(0);
    await runIntegrityCheck(JOBS);
    expect(await openIssues(seeded.map((m) => m.id))).toEqual([]);
  });
});

describe("[P1-17] corrupted data is found (and never fixed)", () => {
  it("[P1-17] cached counters that disagree with the ledger", async () => {
    await approvedVisit(w.member, { seen: true });
    await db()
      .update(memberships)
      .set({ progressGold: 150, ingotsCompleted: 2 })
      .where(eq(memberships.id, w.member.id));
    const run = await runIntegrityCheck(JOBS);
    expect(run.newIssues).toBeGreaterThanOrEqual(1);
    const [issue] = await openIssues([w.member.id]);
    expect(issue).toMatchObject({
      check: "membership_counters",
      entity: "memberships",
      shopId: w.shop.id,
      details: { progress: 150, ledgerProgress: 100, ingots: 2, ledgerIngots: 0 },
    });
    // Read-only: the counters are still the wrong ones.
    const [m] = await db().select().from(memberships).where(eq(memberships.id, w.member.id));
    expect(m).toMatchObject({ progressGold: 150, ingotsCompleted: 2 });
  });

  it("[P1-17] a receipt number gap in a shop", async () => {
    const visit = await approvedVisit(w.member, { seen: true });
    const [r] = await db().select().from(receipts).where(eq(receipts.id, visit.receiptId));
    const [req] = await db()
      .insert(pointRequests)
      .values({
        membershipId: w.member.id,
        userId: w.member.userId,
        shopId: w.shop.id,
        idempotencyKey: newId(),
      })
      .returning({ id: pointRequests.id });
    await db().insert(receipts).values({
      shopId: w.shop.id,
      membershipId: w.member.id,
      requestId: req!.id,
      number: 5,
      data: r!.data,
      createdBy: r!.createdBy,
    });
    await runIntegrityCheck(JOBS);
    const [issue] = await openIssues([w.shop.id]);
    expect(issue).toMatchObject({ check: "receipt_numbers", details: { receipts: 2, highest: 5 } });
  });

  it("[P1-17] a reward redeemed twice; a request approved twice", async () => {
    await db()
      .update(memberships)
      .set({ progressGold: 950 })
      .where(eq(memberships.id, w.member.id));
    const visit = await approvedVisit(w.member, { seen: true });
    const rewardId = visit.rewardIds[0]!;
    const code = await transaction(w.customer, (tx) =>
      createRedemptionCode(w.customer, rewardId, tx),
    );
    await confirmRedemption(w.owner, code.code);
    // A second redeem row for the same reward, and a second earn row for the same request (past the walls).
    await db()
      .insert(ledgerEntries)
      .values([
        {
          membershipId: w.member.id,
          shopId: w.shop.id,
          type: "redeem",
          points: 0,
          idempotencyKey: `${newId()}:redeem`,
          ref: { rewardId, redemptionId: newId() },
        },
        {
          membershipId: w.member.id,
          shopId: w.shop.id,
          type: "earn",
          points: 100,
          requestId: visit.requestId,
          idempotencyKey: `${newId()}:earn`,
          ref: { requestId: visit.requestId },
        },
      ]);
    await runIntegrityCheck(JOBS);
    const issues = await openIssues([rewardId, visit.requestId]);
    expect(issues.map((i) => i.check).sort()).toEqual([
      "request_approved_twice",
      "reward_redeemed_twice",
    ]);
  });

  it("[P1-17] a redeem row with gold (the database refuses it; the check finds one that got past)", async () => {
    const bad = sql`INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, idempotency_key)
      VALUES (${newId()}, ${w.member.id}, ${w.shop.id}, 'redeem', 50, ${`${newId()}:redeem`})`;
    await expect(db().execute(bad)).rejects.toThrow();
    const id = newId();
    await db().transaction(async (tx) => {
      await tx.execute(
        sql`ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_points_by_type`,
      );
      await tx.execute(sql`INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, idempotency_key)
        VALUES (${id}, ${w.member.id}, ${w.shop.id}, 'redeem', 50, ${`${id}:redeem`})`);
      await tx.execute(sql`ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_points_by_type CHECK (CASE type
        WHEN 'earn' THEN points > 0 WHEN 'bonus_streak' THEN points > 0 WHEN 'bonus_referral' THEN points > 0
        WHEN 'bonus_game' THEN points > 0 WHEN 'redeem' THEN points = 0 WHEN 'reversal' THEN points < 0
        WHEN 'expiry' THEN points < 0 ELSE points <> 0 END) NOT VALID`);
    });
    await runIntegrityCheck(JOBS);
    const [issue] = await openIssues([id]);
    expect(issue).toMatchObject({ check: "redeem_not_zero", details: { points: 50 } });
  });

  it("[P1-17] an approved request with no ledger rows; no receipt only once its 15 minutes have passed", async () => {
    const visit = await approvedVisit(w.member, { seen: true });
    const [src] = await db()
      .select()
      .from(pointRequests)
      .where(eq(pointRequests.id, visit.requestId));
    const copy = (minutesAgo: number) => ({
      ...src!,
      id: newId(),
      idempotencyKey: newId(),
      requestedAt: new Date(Date.now() - (minutesAgo + 5) * 60_000),
      decidedAt: new Date(Date.now() - minutesAgo * 60_000),
    });
    const old = copy(60);
    const recent = copy(5);
    await db().insert(pointRequests).values([old, recent]);
    await runIntegrityCheck(JOBS);
    const oldIssues = (await openIssues([old.id])).map((i) => i.check).sort();
    expect(oldIssues).toEqual(["approved_without_ledger", "approved_without_receipt"]);
    expect((await openIssues([recent.id])).map((i) => i.check)).toEqual([
      "approved_without_ledger",
    ]);
  });
});

describe("[P1-17] issue lifecycle and runs", () => {
  const corrupt = () =>
    db().update(memberships).set({ progressGold: 321 }).where(eq(memberships.id, w.member.id));

  it("[P1-17] an issue still open is not recorded twice and keeps its detected_at; a fix resolves it", async () => {
    await corrupt();
    await runIntegrityCheck(JOBS);
    const [first] = await openIssues([w.member.id]);
    const second = await runIntegrityCheck(JOBS);
    const rows = await db()
      .select()
      .from(integrityIssues)
      .where(eq(integrityIssues.entityId, w.member.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detectedAt.getTime()).toBe(first?.detectedAt.getTime());
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(first!.lastSeenAt.getTime());
    expect(second.newIssues).toBe(0);
    // Corrected later (the counter put back): the next run marks it resolved.
    await db().update(memberships).set({ progressGold: 0 }).where(eq(memberships.id, w.member.id));
    await runIntegrityCheck(JOBS);
    expect(await openIssues([w.member.id])).toEqual([]);
    const [resolved] = await db()
      .select()
      .from(integrityIssues)
      .where(eq(integrityIssues.entityId, w.member.id));
    expect(resolved?.resolvedAt).not.toBeNull();
  });

  it("[P1-17] a run overlapping another skips (single-run lock)", async () => {
    await limiterRedis().set(
      `${env().REDIS_KEY_PREFIX}lock:integrity-check`,
      "other-run",
      "PX",
      60_000,
    );
    expect(await runIntegrityCheck(JOBS)).toMatchObject({ skipped: true, issues: 0 });
  });

  it("[P1-17] small keyset pages still check every membership; the run changes no business row", async () => {
    for (let i = 0; i < 5; i++) {
      const u = await makeUser();
      await makeMembership(u.id, w.shop.id);
    }
    await corrupt();
    const sums = () =>
      db()
        .execute(sql`SELECT (SELECT count(*) FROM ledger_entries) AS l, (SELECT coalesce(sum(progress_gold), 0)
        FROM memberships) AS p, (SELECT count(*) FROM receipts) AS r, (SELECT count(*) FROM rewards
        WHERE redeemed_at IS NOT NULL) AS d`);
    const before = await sums();
    const run = await runIntegrityCheck(JOBS, { batch: { members: 2, rows: 3 } });
    expect(run.checkedMemberships).toBeGreaterThanOrEqual(6);
    expect((await openIssues([w.member.id])).map((i) => i.check)).toEqual(["membership_counters"]);
    expect(await sums()).toEqual(before);
  });
});

describe("[P1-17] the admin's on-demand run (worker side)", () => {
  it("[P1-17] runs for an admin owner's queued scope and refuses any other", async () => {
    const { HANDLERS } = await import("@/server/jobs/handlers");
    const { mintAdminScope } = await import("@/server/authz/scope");
    const handler = HANDLERS.scheduled["integrity-check-requested"];
    const job = {} as Parameters<typeof handler>[1];
    await db().update(memberships).set({ progressGold: 77 }).where(eq(memberships.id, w.member.id));
    await expect(
      handler({}, job, { scope: mintAdminScope({ userId: newId(), role: "support" }) }),
    ).rejects.toThrow(/not an admin owner/);
    expect(await openIssues([w.member.id])).toEqual([]);
    await handler({}, job, { scope: mintAdminScope({ userId: newId(), role: "owner" }) });
    expect((await openIssues([w.member.id])).map((i) => i.check)).toEqual(["membership_counters"]);
  });
});
