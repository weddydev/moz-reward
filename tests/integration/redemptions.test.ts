import { and, eq, type SQL, sql } from "drizzle-orm";
import Redis from "ioredis";
import { beforeEach, describe, expect, it } from "vitest";
import { REDEEM, rewardExpiresAt } from "@/lib/loyalty/redeem";
import { mintCustomerScope, mintShopScope, type Scope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import {
  auditLogs,
  ledgerEntries,
  memberships,
  notifications,
  outbox,
  redemptionCodes,
  rewards,
  shops,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { transaction, withScope } from "@/server/repos/_base";
import { readOwnReadyRewards } from "@/server/repos/redemptions";
import { redeemCodeHash } from "@/server/security/redeem-code";
import {
  attemptWeight,
  REDEEM_GUARD,
  RedeemGuardUnavailable,
  releaseRedeemAttempt,
  reserveRedeemAttempt,
} from "@/server/security/redeem-guard";
import { leaveShop } from "@/server/services/membership";
import {
  confirmRedemption,
  createRedemptionCode,
  REDEEM_MESSAGES,
} from "@/server/services/redemptions";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { approvedVisit } from "@/server/testing/visits";

/**
 * P1-16 rewards and redemption (PRODUCT §6, §15; SECURITY §6; drizzle/0034): codes, confirm, the database walls
 * under the web role, leave/rejoin (C-70), the shop state matrix and the guessing guard.
 */
const DENIED = "42501";

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function appError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected an AppError");
}

async function world(opts: { validDays?: number } = {}) {
  const [shop, otherShop, ownerUser, staffUser, otherStaffUser, customer] = await Promise.all([
    makeShop({ status: "active", name: "Brew & Bloom Café" }),
    makeShop({ status: "active", name: "Other Shop" }),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shop.id, ownerUser.id, "owner"),
    makeStaff(shop.id, staffUser.id, "staff"),
    makeStaff(otherShop.id, otherStaffUser.id, "owner"),
    makeProgramme(shop.id, 1_000, {
      milestones: [],
      streak: null,
      rewardValidDays: opts.validDays ?? 90,
    }),
    makeProgramme(otherShop.id, 1_000, { milestones: [], streak: null }),
  ]);
  const member = await makeMembership(customer.id, shop.id, { progressGold: 950 });
  const visit = await approvedVisit(member, { seen: true });
  const rewardId = visit.rewardIds[0];
  if (!rewardId) throw new Error("no reward unlocked");
  return {
    shop,
    otherShop,
    member,
    rewardId,
    customerId: customer.id,
    customer: mintCustomerScope({ userId: customer.id }),
    owner: mintShopScope({ userId: ownerUser.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: staffUser.id, shopId: shop.id, role: "staff" }),
    otherStaff: mintShopScope({ userId: otherStaffUser.id, shopId: otherShop.id, role: "owner" }),
  };
}

type World = Awaited<ReturnType<typeof world>>;
let w: World;
beforeEach(async () => {
  w = await world();
});

const redeem = (scope = w.customer, rewardId = w.rewardId) =>
  transaction(scope, (tx) => createRedemptionCode(scope, rewardId, tx));
const rewardRow = async (id = w.rewardId) => {
  const [row] = await db().select().from(rewards).where(eq(rewards.id, id));
  if (!row) throw new Error("no reward");
  return row;
};
const codeRow = async (id: string) => {
  const [row] = await db().select().from(redemptionCodes).where(eq(redemptionCodes.id, id));
  if (!row) throw new Error("no code");
  return row;
};
const asScope = (scope: Scope, statement: SQL) => withScope(scope, (q) => q.execute(statement));
const asScopeTx = (
  scope: Scope,
  fn: (q: Parameters<Parameters<typeof transaction>[1]>[0]) => Promise<unknown>,
) => transaction(scope, fn);
/** Moves a code's 15 minutes into the past (the window CHECK keeps created_at + 15 min = expires_at). */
const ageCode = (id: string, ms: number) =>
  db()
    .update(redemptionCodes)
    .set({
      createdAt: sql`${redemptionCodes.createdAt} - make_interval(secs => ${ms / 1000})`,
      expiresAt: sql`${redemptionCodes.expiresAt} - make_interval(secs => ${ms / 1000})`,
    })
    .where(eq(redemptionCodes.id, id));

describe("[P1-16] reward validity", () => {
  it("[P1-16] a reward unlocked now is valid to the end of the London day 90 days on", async () => {
    const r = await rewardRow();
    expect(r.expiresAt.toISOString()).toBe(rewardExpiresAt(r.unlockedAt, 90).toISOString());
  });

  it("[P1-16] a shop's longer validity applies to rewards unlocked under it", async () => {
    w = await world({ validDays: 180 });
    const r = await rewardRow();
    expect(r.expiresAt.toISOString()).toBe(rewardExpiresAt(r.unlockedAt, 180).toISOString());
  });

  it("[P1-16] the database sets expires_at, whatever the writer sends", async () => {
    const [row] = await db()
      .insert(rewards)
      .values({
        membershipId: w.member.id,
        shopId: w.shop.id,
        kind: "main",
        label: "Planted",
        ingotNumber: 9,
        rewardsVersion: 1,
        expiresAt: new Date("2099-01-01T00:00:00Z"),
      })
      .returning();
    expect(row?.expiresAt.toISOString()).toBe(rewardExpiresAt(row!.unlockedAt, 90).toISOString());
  });

  it("[P1-16] the ready list holds unredeemed, unexpired rewards of current memberships", async () => {
    const list = await readOwnReadyRewards(w.customer, { now: new Date() });
    expect(list.map((r) => r.id)).toEqual([w.rewardId]);
    expect(list[0]).toMatchObject({ shopName: "Brew & Bloom Café", kind: "main" });
    const later = new Date((await rewardRow()).expiresAt.getTime());
    expect(await readOwnReadyRewards(w.customer, { now: later })).toEqual([]);
  });
});

describe("[P1-16] the redeem code", () => {
  it("[P1-16] Redeem gives a 6-character code for 15 minutes; only its HMAC is stored", async () => {
    const r = await redeem();
    expect(r.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    expect(r.expiresAt - r.serverNow).toBeGreaterThan(REDEEM.codeValidMs - 5_000);
    expect(r.expiresAt - r.serverNow).toBeLessThanOrEqual(REDEEM.codeValidMs);
    expect(r.shopName).toBe("Brew & Bloom Café");
    expect(r.rewardLabel.length).toBeGreaterThan(0);
    const row = await codeRow(r.codeId);
    expect(row.status).toBe("live");
    expect(row.codeHash).toBe(redeemCodeHash(w.shop.id, r.code));
    expect(JSON.stringify(row)).not.toContain(r.code);
    const [audit] = await db().select().from(auditLogs).where(eq(auditLogs.entityId, w.rewardId));
    expect(audit?.action).toBe("redemption.code_created");
    expect(JSON.stringify(audit)).not.toContain(r.code);
  });

  it("[P1-16] a second Redeem voids the first code; staff typing the old one is told it was replaced", async () => {
    const first = await redeem();
    const second = await redeem();
    expect((await codeRow(first.codeId)).status).toBe("voided");
    expect((await codeRow(first.codeId)).voidReason).toBe("regenerated");
    expect((await codeRow(second.codeId)).status).toBe("live");
    const err = await appError(() => confirmRedemption(w.staff, first.code));
    expect(err.message).toBe(REDEEM_MESSAGES.replaced);
    await confirmRedemption(w.staff, second.code);
  });

  it("[P1-16] someone else's reward is not found; an expired or redeemed one is refused", async () => {
    const stranger = mintCustomerScope({ userId: (await makeUser()).id });
    expect((await appError(() => redeem(stranger))).code).toBe("NOT_FOUND");
    const r = await redeem();
    await confirmRedemption(w.staff, r.code);
    expect((await appError(() => redeem())).message).toBe(REDEEM_MESSAGES.alreadyRedeemed);
    w = await world();
    await db()
      .update(rewards)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(rewards.id, w.rewardId));
    expect((await appError(() => redeem())).message).toBe(REDEEM_MESSAGES.rewardExpired);
  });
});

describe("[P1-16] confirming a code", () => {
  it("[P1-16] confirm redeems the reward once, with a 0-gold redeem entry, an event, a notice and audit", async () => {
    const before = (
      await db().select().from(memberships).where(eq(memberships.id, w.member.id))
    )[0];
    const r = await redeem();
    const out = await confirmRedemption(
      w.staff,
      ` ${r.code.toLowerCase().slice(0, 3)}-${r.code.slice(3)} `,
    );
    expect(out).toMatchObject({ redemptionId: r.codeId, kind: "main" });
    const code = await codeRow(r.codeId);
    expect(code).toMatchObject({ status: "confirmed", confirmedBy: w.staff.userId });
    expect(code.confirmTxId).not.toBeNull();
    expect((await rewardRow()).redeemedAt).not.toBeNull();
    const ledger = await db()
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.membershipId, w.member.id), eq(ledgerEntries.type, "redeem")));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      points: 0,
      requestId: null,
      receiptId: null,
      idempotencyKey: `${r.codeId}:redeem`,
      ref: { rewardId: w.rewardId, redemptionId: r.codeId },
    });
    const after = (await db().select().from(memberships).where(eq(memberships.id, w.member.id)))[0];
    expect(after?.progressGold).toBe(before?.progressGold);
    expect(after?.ingotsCompleted).toBe(before?.ingotsCompleted);
    const events = (
      await db()
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.scopeShopId, w.shop.id))
    ).map((o) => JSON.stringify(o.payload));
    expect(events.some((e) => e.includes("redemption_confirmed") && e.includes(r.codeId))).toBe(
      true,
    );
    const notices = await db()
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.userId, w.customerId), eq(notifications.type, "reward_redeemed")),
      );
    expect(notices).toHaveLength(1);
    const audits = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "redemption.confirmed"));
    expect(audits.some((a) => a.entityId === w.rewardId)).toBe(true);
  });

  it("[P1-16] a second confirm of the same code says Already redeemed", async () => {
    const r = await redeem();
    await confirmRedemption(w.staff, r.code);
    expect((await appError(() => confirmRedemption(w.owner, r.code))).message).toBe(
      REDEEM_MESSAGES.alreadyRedeemed,
    );
  });

  it("[P1-16] five team members confirming the same code in parallel: exactly one succeeds", async () => {
    const team = [w.staff, w.owner];
    for (let i = 0; i < 3; i++) {
      const u = await makeUser();
      await makeStaff(w.shop.id, u.id, "staff");
      team.push(mintShopScope({ userId: u.id, shopId: w.shop.id, role: "staff" }));
    }
    const r = await redeem();
    const results = await Promise.allSettled(team.map((s) => confirmRedemption(s, r.code)));
    const ok = results.filter((x) => x.status === "fulfilled");
    expect(ok).toHaveLength(1);
    for (const x of results) {
      if (x.status === "rejected")
        expect((x.reason as AppError).message).toBe(REDEEM_MESSAGES.alreadyRedeemed);
    }
    const ledger = await db()
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.membershipId, w.member.id), eq(ledgerEntries.type, "redeem")));
    expect(ledger).toHaveLength(1);
  });

  it("[P1-16] an expired code is refused", async () => {
    const r = await redeem();
    await ageCode(r.codeId, REDEEM.codeValidMs + 1_000);
    expect((await appError(() => confirmRedemption(w.staff, r.code))).message).toBe(
      REDEEM_MESSAGES.codeExpired,
    );
    expect((await codeRow(r.codeId)).status).toBe("live");
    // A code a day old is no longer looked up at all.
    await ageCode(r.codeId, 86_400_000);
    expect((await appError(() => confirmRedemption(w.staff, r.code))).message).toBe(
      REDEEM_MESSAGES.notRecognised,
    );
    const s = await redeem();
    await ageCode(s.codeId, REDEEM.codeValidMs - 500);
    await new Promise((res) => setTimeout(res, 700));
    expect((await appError(() => confirmRedemption(w.staff, s.code))).message).toBe(
      REDEEM_MESSAGES.codeExpired,
    );
  });

  it("[P1-16] a reward that expires during the code's window can't be confirmed", async () => {
    const r = await redeem();
    await db()
      .update(rewards)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(rewards.id, w.rewardId));
    expect((await appError(() => confirmRedemption(w.staff, r.code))).message).toBe(
      REDEEM_MESSAGES.rewardExpired,
    );
  });

  it("[P1-16] another shop's team can't confirm it (same answer as a wrong code)", async () => {
    const r = await redeem();
    const err = await appError(() => confirmRedemption(w.otherStaff, r.code));
    expect(err.message).toBe(REDEEM_MESSAGES.notRecognised);
    expect((await codeRow(r.codeId)).status).toBe("live");
  });

  it("[P1-16] a team member can't confirm their own reward", async () => {
    const own = await makeMembership(w.staff.userId, w.shop.id, { progressGold: 950 });
    const visit = await approvedVisit(own, { seen: true });
    const me = mintCustomerScope({ userId: w.staff.userId });
    const r = await transaction(me, (tx) => createRedemptionCode(me, visit.rewardIds[0]!, tx));
    expect((await appError(() => confirmRedemption(w.staff, r.code))).message).toBe(
      REDEEM_MESSAGES.ownReward,
    );
  });
});

describe("[P1-16] shop state (PRODUCT §15)", () => {
  const setStatus = (status: "suspended" | "closed" | "restricted") =>
    db().update(shops).set({ status }).where(eq(shops.id, w.shop.id));

  it("[P1-16] restricted shops redeem; suspended shops neither make nor confirm codes", async () => {
    await setStatus("restricted");
    const r = await redeem();
    await setStatus("suspended");
    expect((await appError(() => redeem())).message).toBe(REDEEM_MESSAGES.shopNotRedeeming);
    expect((await appError(() => confirmRedemption(w.staff, r.code))).message).toBe(
      REDEEM_MESSAGES.shopNotRedeeming,
    );
  });

  it("[P1-16] closed shops redeem for 30 days after closing, then not", async () => {
    await setStatus("closed");
    const [s] = await db().select().from(shops).where(eq(shops.id, w.shop.id));
    expect(s?.closedAt).not.toBeNull();
    await db()
      .update(shops)
      .set({ closedAt: new Date(Date.now() - 29 * 86_400_000) })
      .where(eq(shops.id, w.shop.id));
    const r = await redeem();
    await confirmRedemption(w.staff, r.code);
    w = await world();
    await setStatus("closed");
    await db()
      .update(shops)
      .set({ closedAt: new Date(Date.now() - 31 * 86_400_000) })
      .where(eq(shops.id, w.shop.id));
    expect((await appError(() => redeem())).message).toBe(REDEEM_MESSAGES.shopNotRedeeming);
  });

  it("[P1-16] closed_at follows the status and the web role can't set it", async () => {
    await setStatus("closed");
    await db().update(shops).set({ status: "active" }).where(eq(shops.id, w.shop.id));
    const [s] = await db().select().from(shops).where(eq(shops.id, w.shop.id));
    expect(s?.closedAt).toBeNull();
  });
});

describe("[P1-16] leave and rejoin (C-70)", () => {
  it("[P1-16] leaving voids the live code (staff confirm fails); the reward reappears on rejoin, same validity", async () => {
    const r = await redeem();
    const expiresAt = (await rewardRow()).expiresAt;
    await transaction(w.customer, (tx) => leaveShop(w.customer, w.shop.id, tx));
    expect((await codeRow(r.codeId)).voidReason).toBe("left");
    expect((await appError(() => confirmRedemption(w.staff, r.code))).code).toBe("NOT_FOUND");
    expect(await readOwnReadyRewards(w.customer, { now: new Date() })).toEqual([]);
    expect((await appError(() => redeem())).message).toBe(REDEEM_MESSAGES.left);
    await db().update(memberships).set({ leftAt: null }).where(eq(memberships.id, w.member.id));
    const back = await readOwnReadyRewards(w.customer, { now: new Date() });
    expect(back.map((x) => [x.id, x.expiresAt.toISOString()])).toEqual([
      [w.rewardId, expiresAt.toISOString()],
    ]);
  });
});

describe("[P1-16] database walls (web role, no service code)", () => {
  it("[P1-16] a customer can't redeem a reward; nobody changes its validity directly", async () => {
    // No customer UPDATE policy: the row is invisible to the update, nothing changes.
    await asScope(w.customer, sql`UPDATE rewards SET redeemed_at = now() WHERE id = ${w.rewardId}`);
    expect((await rewardRow()).redeemedAt).toBeNull();
    expect(
      await pgCode(() =>
        asScope(
          w.staff,
          sql`UPDATE rewards SET expires_at = now() + interval '1 year' WHERE id = ${w.rewardId}`,
        ),
      ),
    ).toBe(DENIED);
  });

  it("[P1-16] the team can't mark a reward redeemed without confirming its code in the same transaction", async () => {
    expect(
      await pgCode(() =>
        asScope(w.staff, sql`UPDATE rewards SET redeemed_at = now() WHERE id = ${w.rewardId}`),
      ),
    ).toBe(DENIED);
  });

  it("[P1-16] a customer can't plant a code in another shop, or for someone else's reward", async () => {
    const hash = "a".repeat(64);
    // Their own reward, but the other shop's id: the shop's live set (and its guessing budget) stays its own.
    expect(
      await pgCode(() =>
        asScope(
          w.customer,
          sql`INSERT INTO redemption_codes (id, shop_id, membership_id, reward_id, code_hash, expires_at)
              VALUES (gen_random_uuid(), ${w.otherShop.id}, ${w.member.id}, ${w.rewardId}, ${hash}, now() + interval '15 minutes')`,
        ),
      ),
    ).toBe(DENIED);
    const stranger = mintCustomerScope({ userId: (await makeUser()).id });
    expect(
      await pgCode(() =>
        asScope(
          stranger,
          sql`INSERT INTO redemption_codes (id, shop_id, membership_id, reward_id, code_hash, expires_at)
              VALUES (gen_random_uuid(), ${w.shop.id}, ${w.member.id}, ${w.rewardId}, ${hash}, now() + interval '15 minutes')`,
        ),
      ),
    ).toBe(DENIED);
    // A longer window than 15 minutes is refused too.
    expect(
      await pgCode(() =>
        asScope(
          w.customer,
          sql`INSERT INTO redemption_codes (id, shop_id, membership_id, reward_id, code_hash, expires_at)
              VALUES (gen_random_uuid(), ${w.shop.id}, ${w.member.id}, ${w.rewardId}, ${hash}, now() + interval '1 day')`,
        ),
      ),
    ).toBeDefined();
  });

  it("[P1-16] a customer can't confirm their own code; the team can't void one or confirm another shop's", async () => {
    const r = await redeem();
    expect(
      await pgCode(() =>
        asScope(
          w.customer,
          sql`UPDATE redemption_codes SET status = 'confirmed', confirmed_by = ${w.customerId}, confirmed_at = now() WHERE id = ${r.codeId}`,
        ),
      ),
    ).toBe(DENIED);
    expect(
      await pgCode(() =>
        asScope(
          w.staff,
          sql`UPDATE redemption_codes SET status = 'voided', voided_at = now(), void_reason = 'left' WHERE id = ${r.codeId}`,
        ),
      ),
    ).toBe(DENIED);
    // Another shop's team sees no row (RLS): nothing changes.
    await asScope(
      w.otherStaff,
      sql`UPDATE redemption_codes SET status = 'confirmed', confirmed_by = ${w.otherStaff.userId}, confirmed_at = now() WHERE id = ${r.codeId}`,
    );
    expect((await codeRow(r.codeId)).status).toBe("live");
  });

  it("[P1-16] the team can't confirm an expired code directly, nor change anything else on it", async () => {
    const r = await redeem();
    expect(
      await pgCode(() =>
        asScope(
          w.staff,
          sql`UPDATE redemption_codes SET status = 'confirmed', confirmed_by = ${w.staff.userId}, confirmed_at = now(), reward_id = reward_id, expires_at = expires_at + interval '1 hour' WHERE id = ${r.codeId}`,
        ),
      ),
    ).toBeDefined();
    await ageCode(r.codeId, REDEEM.codeValidMs + 1_000);
    expect(
      await pgCode(() =>
        asScope(
          w.staff,
          sql`UPDATE redemption_codes SET status = 'confirmed', confirmed_by = ${w.staff.userId}, confirmed_at = now() WHERE id = ${r.codeId}`,
        ),
      ),
    ).toBe(DENIED);
  });

  it("[P1-16] a redeem ledger row only beside a confirm, and it never lets the team move progress", async () => {
    const r = await redeem();
    const row = sql`INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, idempotency_key, ref, created_by)
      VALUES (gen_random_uuid(), ${w.member.id}, ${w.shop.id}, 'redeem', 0, ${`${r.codeId}:redeem`},
              ${JSON.stringify({ rewardId: w.rewardId, redemptionId: r.codeId })}::jsonb, ${w.staff.userId})`;
    expect(await pgCode(() => asScope(w.staff, row))).toBe(DENIED);
    // Confirmed in this transaction, then a progress change riding on the redeem row: refused.
    expect(
      await pgCode(() =>
        asScopeTx(w.staff, async (tx) => {
          await tx.execute(
            sql`UPDATE redemption_codes SET status = 'confirmed', confirmed_by = ${w.staff.userId}, confirmed_at = now() WHERE id = ${r.codeId}`,
          );
          await tx.execute(sql`UPDATE rewards SET redeemed_at = now() WHERE id = ${w.rewardId}`);
          await tx.execute(row);
          await tx.execute(
            sql`UPDATE memberships SET progress_gold = progress_gold + 500 WHERE id = ${w.member.id}`,
          );
        }),
      ),
    ).toBe(DENIED);
    expect((await codeRow(r.codeId)).status).toBe("live");
  });

  it("[P1-16] nobody deletes codes", async () => {
    const r = await redeem();
    for (const scope of [w.customer, w.staff, w.owner])
      expect(
        await pgCode(() =>
          asScope(scope, sql`DELETE FROM redemption_codes WHERE id = ${r.codeId}`),
        ),
      ).toBe(DENIED);
  });
});

describe("[P1-16] the guessing guard (SECURITY §6)", () => {
  const T = 1_900_000_000_000;

  it("[P1-16] every attempt weighs max(L, 1) + 1", () => {
    expect([0, 1, 2, 30].map(attemptWeight)).toEqual([2, 2, 3, 31]);
  });

  it("[P1-16] a shop's wrong codes stop at the budget (under 1 in 1,000,000 a day), across its team", async () => {
    const shopId = (await makeShop({ status: "active" })).id;
    let used = 0;
    let staff = 0;
    let refused: string | null = null;
    // Each team member spends up to their share; the shop stops at the budget.
    for (let i = 0; i < 2_000 && !refused; i++) {
      if (i % 10 === 0) staff++;
      const d = await reserveRedeemAttempt({
        shopId,
        staffId: `staff-${String(staff)}`,
        liveCodes: 20,
        now: T + i,
      });
      if (d.kind === "reserved") used += attemptWeight(20);
      else if (d.kind === "shop_exhausted") refused = d.kind;
    }
    expect(refused).toBe("shop_exhausted");
    expect(used).toBeLessThanOrEqual(REDEEM.shopGuessBudget);
    expect(used / REDEEM.codeSpace).toBeLessThan(1e-6);
    // 24 h later the oldest attempts have left the window.
    const later = await reserveRedeemAttempt({
      shopId,
      staffId: "staff-new",
      liveCodes: 20,
      now: T + 86_400_000 + 5_000,
    });
    expect(later.kind).toBe("reserved");
  });

  it("[P1-16] the shop's first refusal is flagged once (owner notice), later ones not", async () => {
    const shopId = (await makeShop({ status: "active" })).id;
    const flags: boolean[] = [];
    for (let i = 0; i < 400; i++) {
      const d = await reserveRedeemAttempt({
        shopId,
        staffId: `s${String(Math.floor(i / 10))}`,
        liveCodes: 30,
        now: T + i,
      });
      if (d.kind === "shop_exhausted") flags.push(d.firstRefusal);
    }
    expect(flags[0]).toBe(true);
    expect(flags.slice(1).every((f) => !f)).toBe(true);
  });

  it("[P1-16] one team member: locked after 5 attempts (1 min, doubling), and at most a third of the budget", async () => {
    const shopId = (await makeShop({ status: "active" })).id;
    for (let i = 0; i < REDEEM_GUARD.staffLockAfter; i++)
      expect(
        (await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + i })).kind,
      ).toBe("reserved");
    const locked = await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 10 });
    expect(locked).toMatchObject({ kind: "staff_locked" });
    expect(locked.kind === "staff_locked" && locked.retryAfterSec).toBeLessThanOrEqual(60);
    expect(
      (await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 61_000 })).kind,
    ).toBe("reserved");
    expect(
      (await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 62_000 })).kind,
    ).toBe("staff_locked");
    // The share: a big shop (L = 100 → weight 101) lets one person try twice, then refuses the third.
    const big = (await makeShop({ status: "active" })).id;
    expect(
      (await reserveRedeemAttempt({ shopId: big, staffId: "b", liveCodes: 100, now: T })).kind,
    ).toBe("reserved");
    expect(
      (await reserveRedeemAttempt({ shopId: big, staffId: "b", liveCodes: 100, now: T + 1 })).kind,
    ).toBe("reserved");
    expect(
      (await reserveRedeemAttempt({ shopId: big, staffId: "b", liveCodes: 100, now: T + 2 })).kind,
    ).toBe("staff_share");
    expect(
      (await reserveRedeemAttempt({ shopId: big, staffId: "c", liveCodes: 100, now: T + 3 })).kind,
    ).toBe("reserved");
  });

  it("[P1-16] a committed confirm gives its attempt back", async () => {
    const shopId = (await makeShop({ status: "active" })).id;
    for (let i = 0; i < 4; i++)
      await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + i });
    const d = await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 4 });
    if (d.kind !== "reserved") throw new Error("expected a reservation");
    await releaseRedeemAttempt(d.reservation);
    expect(
      (await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 5 })).kind,
    ).toBe("reserved");
  });

  it("[P1-16] after a lock has passed, correct confirms back to back aren't locked (only misses count)", async () => {
    // Code review M6 (P1-D close): a committed confirm must not re-arm the lock for the next one at a busy till.
    const shopId = (await makeShop({ status: "active" })).id;
    for (let i = 0; i < REDEEM_GUARD.staffLockAfter; i++)
      await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + i });
    for (const at of [T + 61_000, T + 61_500, T + 62_000]) {
      const d = await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: at });
      expect(d.kind, `confirm at +${String(at - T)} ms`).toBe("reserved");
      if (d.kind === "reserved") await releaseRedeemAttempt(d.reservation);
    }
    // A sixth miss still doubles the lock (2 min from that miss).
    expect(
      (await reserveRedeemAttempt({ shopId, staffId: "a", liveCodes: 1, now: T + 63_000 })).kind,
    ).toBe("reserved");
    const locked = await reserveRedeemAttempt({
      shopId,
      staffId: "a",
      liveCodes: 1,
      now: T + 64_000,
    });
    expect(locked).toMatchObject({ kind: "staff_locked" });
    expect(locked.kind === "staff_locked" && locked.retryAfterSec).toBeGreaterThan(60);
  });

  it("[P1-16] Redis down: the guard fails closed", async () => {
    const dead = new Redis({
      port: 1,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
    });
    await expect(
      reserveRedeemAttempt({ shopId: w.shop.id, staffId: "a", liveCodes: 1, redis: dead }),
    ).rejects.toBeInstanceOf(RedeemGuardUnavailable);
    dead.disconnect();
  });

  it("[P1-16] wrong codes count, a wrong format too; the shop's exhausted budget is audited and the owner told", async () => {
    // Fill most of the shop's budget with other team members' wrong attempts, then hit the end through the service.
    for (let i = 0; i < 10; i++) {
      const u = await makeUser();
      await makeStaff(w.shop.id, u.id, "staff");
      const s = mintShopScope({ userId: u.id, shopId: w.shop.id, role: "staff" });
      for (let k = 0; k < 5; k++) {
        const e = await appError(() => confirmRedemption(s, k % 2 ? "ZZZZZZ" : "not-a-code"));
        if (e.code === "RATE_LIMITED") break;
      }
    }
    let last: AppError | null = null;
    for (let i = 0; i < 400 && last?.code !== "RATE_LIMITED"; i++) {
      const u = await makeUser();
      await makeStaff(w.shop.id, u.id, "staff");
      last = await appError(() =>
        confirmRedemption(
          mintShopScope({ userId: u.id, shopId: w.shop.id, role: "staff" }),
          "ZZZZZZ",
        ),
      );
    }
    expect(last?.message).toMatch(/paused/);
    const audits = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "redemption.budget_exhausted"));
    expect(audits.filter((a) => a.entityId === w.shop.id)).toHaveLength(1);
    const ownerNotices = await db()
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, w.owner.userId),
          eq(notifications.type, "redeem_codes_paused"),
        ),
      );
    expect(ownerNotices).toHaveLength(1);
  });
});
