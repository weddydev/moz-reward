import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MARKETING_CONSENT_VERSION } from "@/features/join/consent";
import { newId } from "@/lib/id";
import { leftForfeitAt } from "@/lib/loyalty/engine";
import { TEMPLATES } from "@/lib/loyalty/programme";
import { addLondonDays } from "@/lib/time";
import { mintCustomerScope, mintShopScope, type Scope, systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import {
  ledgerEntries,
  loyaltyPrograms,
  memberships,
  notifications,
  pointsExpiryWarnings,
  rewards,
} from "@/server/db/schema";
import { transaction, withScope } from "@/server/repos/_base";
import { createOwnProfile } from "@/server/repos/profiles";
import { joinShop } from "@/server/services/join";
import { leaveShop } from "@/server/services/membership";
import { runPointsExpiry } from "@/server/services/points-expiry-job";
import {
  makeMembership,
  makeProgramme,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P1-13 (PRODUCT §4, §6, §19): the daily points-expiry job with an injected clock. Rolling expiry from the last
 * approved visit (warnings 30 and 7 days before, each once, then an `expiry` ledger row that removes only
 * current-ingot progress), and the 30-day rule for left memberships (forfeit on London day 31, not day 30), which
 * a late rejoin also applies before re-opening the row (C-73). Plus the database walls of migration 0031.
 */

const JOBS = systemScope("P1-13 tests: points expiry job");

type Shop = Awaited<ReturnType<typeof makeShop>>;

async function shopWithExpiry(months: number | null = 12, status: Shop["status"] = "active") {
  const shop = await makeShop({ status });
  await makeProgramme(shop.id, 1_000, { expiryMonths: months });
  return shop;
}

const LAST_VISIT = new Date("2026-03-10T14:30:00Z");
const EXPIRES = new Date("2027-03-10T14:30:00Z"); // 12 London months later
const AT_30 = new Date("2027-02-08T14:30:00Z");
const AT_7 = new Date("2027-03-03T14:30:00Z");

async function member(
  shop: Shop,
  over: Partial<typeof memberships.$inferInsert> = {},
): Promise<{ id: string; userId: string; shopId: string }> {
  const user = await makeUser();
  const m = await makeMembership(user.id, shop.id, {
    progressGold: 400,
    ingotsCompleted: 2,
    milestonesReached: [25],
    tier: "silver",
    purchaseCount: 9,
    lastVisitAt: LAST_VISIT,
    ...over,
  });
  return { id: m.id, userId: user.id, shopId: shop.id };
}

const run = (now: Date, batch?: number) =>
  runPointsExpiry(JOBS, now, batch === undefined ? {} : { batch });

const membershipRow = async (id: string) => {
  const [row] = await db().select().from(memberships).where(eq(memberships.id, id));
  if (!row) throw new Error("membership missing");
  return row;
};

const warningsTo = (userId: string) =>
  db()
    .select({ payload: notifications.payload, category: notifications.category })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, "points_expiry_warning")))
    .orderBy(notifications.createdAt);

const expiryRows = (membershipId: string) =>
  db()
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.membershipId, membershipId), eq(ledgerEntries.type, "expiry")));

async function addVersion(shopId: string, version: number, expiryMonths: number | null, at: Date) {
  await db()
    .insert(loyaltyPrograms)
    .values({
      shopId,
      version,
      ...TEMPLATES.cafe.rules,
      ingotSize: 1_000,
      expiryMonths,
      activeFrom: at,
      rewardsFrom: at,
      createdBy: newId(),
    });
}

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

describe("[P1-13] rolling expiry: warnings 30 and 7 days before, each once, then expiry", () => {
  it("warns 30 days before (once), then 7 days before (once), then expires only current-ingot gold", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop, { goldShortfall: 0 });
    await db().insert(rewards).values({
      membershipId: m.id,
      shopId: shop.id,
      kind: "main",
      label: "Free coffee",
      ingotNumber: 2,
      rewardsVersion: 1,
    });

    await run(new Date(AT_30.getTime() - 1));
    expect(await warningsTo(m.userId)).toEqual([]);

    await run(AT_30);
    await run(new Date(AT_30.getTime() + 3_600_000)); // a retry / second run the same day
    expect(await warningsTo(m.userId)).toEqual([
      {
        category: "transactional",
        payload: { shopId: shop.id, gold: 400, expiresAt: EXPIRES.toISOString(), daysBefore: 30 },
      },
    ]);

    await run(AT_7);
    await run(AT_7);
    expect((await warningsTo(m.userId)).map((w) => w.payload)).toEqual([
      { shopId: shop.id, gold: 400, expiresAt: EXPIRES.toISOString(), daysBefore: 30 },
      { shopId: shop.id, gold: 400, expiresAt: EXPIRES.toISOString(), daysBefore: 7 },
    ]);

    await run(new Date(EXPIRES.getTime() - 1));
    expect((await membershipRow(m.id)).progressGold).toBe(400);
    expect(await expiryRows(m.id)).toEqual([]);

    const before = await membershipRow(m.id);
    await run(EXPIRES);
    await run(new Date(EXPIRES.getTime() + 86_400_000)); // idempotent: the next day writes nothing
    const rows = await expiryRows(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      shopId: shop.id,
      points: -400,
      programVersion: 1,
      idempotencyKey: `${m.id}:expiry:${EXPIRES.toISOString()}`,
      ref: { version: 1 },
      createdBy: null,
    });
    const after = await membershipRow(m.id);
    expect(after).toEqual({ ...before, progressGold: 0, updatedAt: after.updatedAt });
    const [reward] = await db().select().from(rewards).where(eq(rewards.membershipId, m.id));
    expect(reward).toMatchObject({ kind: "main", ingotNumber: 2, redeemedAt: null });
    expect(await warningsTo(m.userId)).toHaveLength(2);
  });

  it("a shortfall stays: expiry removes the current gold only and leaves what is owed", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop, { progressGold: 150, goldShortfall: 30 });
    await run(AT_30);
    await run(AT_7);
    await run(EXPIRES);
    expect(await membershipRow(m.id)).toMatchObject({ progressGold: 0, goldShortfall: 30 });
    expect((await expiryRows(m.id)).map((r) => r.points)).toEqual([-150]);
  });

  it("an approved visit after a warning resets the clock: no expiry on the old date", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop);
    await run(AT_30);
    await run(AT_7);
    await db()
      .update(memberships)
      .set({ lastVisitAt: new Date("2027-03-05T12:00:00Z"), progressGold: 520 })
      .where(eq(memberships.id, m.id));
    await run(EXPIRES);
    await run(new Date("2027-03-20T03:00:00Z"));
    expect(await expiryRows(m.id)).toEqual([]);
    expect((await membershipRow(m.id)).progressGold).toBe(520);
    expect(await warningsTo(m.userId)).toHaveLength(2);
  });

  it("the shop turns expiry off after a warning was sent: no expiry, no more warnings", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop);
    await run(AT_30);
    await addVersion(shop.id, 2, null, new Date("2027-02-20T00:00:00Z"));
    await run(AT_7);
    await run(EXPIRES);
    expect(await expiryRows(m.id)).toEqual([]);
    expect((await membershipRow(m.id)).progressGold).toBe(400);
    expect(await warningsTo(m.userId)).toHaveLength(1);
  });

  it("respects programme versions: the expiry setting in force now (lengthened to 24 months)", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop);
    await addVersion(shop.id, 2, 24, new Date("2027-01-01T00:00:00Z"));
    await run(AT_30);
    await run(EXPIRES);
    expect(await warningsTo(m.userId)).toEqual([]);
    expect(await expiryRows(m.id)).toEqual([]);
  });

  it("switched on late (a member long past the date): both notices first, then expiry 30 days after the first", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop, { lastVisitAt: new Date("2025-01-15T10:00:00Z") });
    const firstRun = new Date("2026-11-27T03:00:00Z");
    await run(firstRun);
    expect((await warningsTo(m.userId)).map((w) => w.payload)).toEqual([
      { shopId: shop.id, gold: 400, expiresAt: "2026-12-27T03:00:00.000Z", daysBefore: 30 },
    ]);
    await run(new Date("2026-12-20T03:00:00Z"));
    expect((await warningsTo(m.userId)).map((w) => w.payload)).toContainEqual({
      shopId: shop.id,
      gold: 400,
      expiresAt: "2026-12-27T03:00:00.000Z",
      daysBefore: 7,
    });
    await run(new Date("2026-12-27T02:59:59Z"));
    expect(await expiryRows(m.id)).toEqual([]);
    await run(new Date("2026-12-27T03:00:00Z"));
    expect((await expiryRows(m.id)).map((r) => r.points)).toEqual([-400]);
  });

  it("month end: a 31 Jan visit is warned on 1 Jan and 24 Jan and expires on 31 Jan", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop, { lastVisitAt: new Date("2026-01-31T09:00:00Z") });
    await run(new Date("2026-12-31T23:59:59Z"));
    expect(await warningsTo(m.userId)).toEqual([]);
    await run(new Date("2027-01-01T09:00:00Z"));
    expect(await warningsTo(m.userId)).toHaveLength(1);
    await run(new Date("2027-01-24T09:00:00Z"));
    await run(new Date("2027-01-31T09:00:00Z"));
    expect((await expiryRows(m.id))[0]?.idempotencyKey).toBe(
      `${m.id}:expiry:2027-01-31T09:00:00.000Z`,
    );
  });

  it("skips left members, shops without expiry, suspended or closed shops, and members with no gold", async () => {
    const off = await shopWithExpiry(null);
    const suspended = await shopWithExpiry(12, "suspended");
    const on = await shopWithExpiry();
    const ms = [
      await member(off),
      await member(suspended),
      await member(on, { leftAt: new Date("2027-03-01T10:00:00Z") }),
      await member(on, { progressGold: 0 }),
    ];
    await run(AT_30);
    await run(AT_7);
    await run(EXPIRES);
    for (const m of ms) {
      expect(await warningsTo(m.userId)).toEqual([]);
      expect(await expiryRows(m.id)).toEqual([]);
    }
  });

  it("pages by membership id (keyset): every member of a page boundary is handled once", async () => {
    const shop = await shopWithExpiry();
    const ms = await Promise.all([1, 2, 3, 4, 5].map(() => member(shop)));
    await run(AT_30, 2);
    await run(AT_7, 2);
    await run(EXPIRES, 2);
    await run(EXPIRES, 2);
    for (const m of ms) {
      expect(await warningsTo(m.userId)).toHaveLength(2);
      expect((await expiryRows(m.id)).map((r) => r.points)).toEqual([-400]);
    }
  });

  it("records each warning against the expiry date it announced (the web role can't read or write them)", async () => {
    const shop = await shopWithExpiry();
    const m = await member(shop);
    await run(AT_30);
    const rows = await db()
      .select()
      .from(pointsExpiryWarnings)
      .where(eq(pointsExpiryWarnings.membershipId, m.id));
    expect(rows).toEqual([
      expect.objectContaining({ expiresAt: EXPIRES, daysBefore: 30, sentAt: AT_30 }),
    ]);
    const customer = mintCustomerScope({ userId: m.userId });
    expect(await withScope(customer, (q) => q.select().from(pointsExpiryWarnings))).toEqual([]);
    expect(
      await pgCode(() =>
        withScope(customer, (q) =>
          q.insert(pointsExpiryWarnings).values({
            membershipId: m.id,
            expiresAt: EXPIRES,
            daysBefore: 7,
          }),
        ),
      ),
    ).toBe("42501");
  });
});

describe("[P1-13] left memberships: frozen progress restored through day 30, forfeit on day 31", () => {
  it("the job forfeits at 00:00 UK time on London day 31 after the leave day, not on day 30", async () => {
    const shop = await shopWithExpiry(null); // the 30-day rule applies whatever the expiry setting
    const leftAt = new Date("2026-11-01T10:00:00Z");
    const m = await member(shop, { leftAt });
    await run(new Date("2026-12-01T23:59:59Z")); // day 30
    expect((await membershipRow(m.id)).progressGold).toBe(400);
    expect(await expiryRows(m.id)).toEqual([]);

    await run(new Date("2026-12-02T00:00:00Z")); // day 31
    await run(new Date("2026-12-03T03:00:00Z")); // idempotent
    const rows = await expiryRows(m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      points: -400,
      ref: { reason: "left" },
      idempotencyKey: `${m.id}:forfeit:${String(Math.floor(leftAt.getTime() / 1000))}`,
    });
    expect(await membershipRow(m.id)).toMatchObject({
      progressGold: 0,
      ingotsCompleted: 2,
      milestonesReached: [25],
      tier: "silver",
      purchaseCount: 9,
      leftAt,
    });
    expect(await warningsTo(m.userId)).toEqual([]); // they left: no notice
  });

  it("a leave at 00:30 BST counts from that London day (forfeit 20 Nov 00:00 GMT for a 20 Oct leave)", async () => {
    const shop = await shopWithExpiry(null);
    const m = await member(shop, { leftAt: new Date("2026-10-19T23:30:00Z") });
    await run(new Date("2026-11-19T23:59:59Z"));
    expect((await membershipRow(m.id)).progressGold).toBe(400);
    await run(new Date("2026-11-20T00:00:00Z"));
    expect((await membershipRow(m.id)).progressGold).toBe(0);
  });

  it("the database's left_forfeit_at() agrees with the engine's leftForfeitAt() across clock changes", async () => {
    const samples = [
      "2026-11-01T10:00:00Z",
      "2026-10-19T23:30:00Z",
      "2027-03-01T12:00:00Z",
      "2027-03-27T23:59:59Z",
      "2027-10-31T00:30:00Z",
      "2028-02-29T18:00:00Z",
    ].map((s) => new Date(s));
    for (const at of samples) {
      const [row] = await db().execute<{ at: string | Date }>(
        sql`SELECT public.left_forfeit_at(${at.toISOString()}::timestamptz) AS at`,
      );
      expect(new Date(row?.at ?? 0).toISOString(), at.toISOString()).toBe(
        leftForfeitAt(at).toISOString(),
      );
    }
  });
});

async function customer() {
  const user = await makeUser();
  const scope = mintCustomerScope({ userId: user.id });
  await transaction(scope, (tx) =>
    createOwnProfile(
      scope,
      { fullName: "Leah Patel", phoneE164: "+447400111222", birthday: null },
      tx,
    ),
  );
  return { id: user.id, scope };
}
type Customer = Awaited<ReturnType<typeof customer>>;

const join = (c: Customer, shop: Shop) =>
  transaction(c.scope, (tx) =>
    joinShop(
      c.scope,
      {
        shopCode: shop.shopCode,
        marketingOptIn: false,
        consentVersion: MARKETING_CONSENT_VERSION,
        consentShopName: shop.tradingName ?? shop.name,
        profile: null,
      },
      tx,
    ),
  );

async function leftLongAgo(days: number) {
  const c = await customer();
  const shop = await shopWithExpiry(null);
  const { membershipId } = await join(c, shop);
  await db()
    .update(memberships)
    .set({ progressGold: 420, ingotsCompleted: 2, purchaseCount: 7, lastVisitAt: new Date() })
    .where(eq(memberships.id, membershipId));
  await transaction(c.scope, (tx) => leaveShop(c.scope, shop.id, tx));
  // The leave `days` London days ago, same wall time.
  await db()
    .update(memberships)
    .set({ leftAt: addLondonDays(new Date(), -days) })
    .where(eq(memberships.id, membershipId));
  return { c, shop, membershipId };
}

describe("[P1-13] rejoin and the 30-day window (C-73)", () => {
  it("rejoin on day 30 restores the frozen progress", async () => {
    const { c, shop, membershipId } = await leftLongAgo(30);
    await join(c, shop);
    expect(await membershipRow(membershipId)).toMatchObject({
      leftAt: null,
      progressGold: 420,
      ingotsCompleted: 2,
    });
    expect(await expiryRows(membershipId)).toEqual([]);
  });

  it("C-73: a rejoin on day 31 gets no frozen progress back even though the job hasn't run", async () => {
    const { c, shop, membershipId } = await leftLongAgo(31);
    await join(c, shop);
    expect(await membershipRow(membershipId)).toMatchObject({
      leftAt: null,
      progressGold: 0,
      ingotsCompleted: 2,
      purchaseCount: 7,
    });
    const rows = await expiryRows(membershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ points: -420, ref: { reason: "left" }, createdBy: null });
    // The job afterwards finds nothing to do (and the rejoined member is not a left member any more).
    await run(new Date());
    expect(await expiryRows(membershipId)).toHaveLength(1);
  });

  it("the job ran first: the rejoin finds nothing left to forfeit (one ledger row)", async () => {
    const { c, shop, membershipId } = await leftLongAgo(40);
    await run(new Date());
    await join(c, shop);
    expect(await expiryRows(membershipId)).toHaveLength(1);
    expect((await membershipRow(membershipId)).progressGold).toBe(0);
  });
});

describe("[P1-13] database walls (migration 0031)", () => {
  it("forfeit_own_left_progress: the caller's own left membership only, customer scope only", async () => {
    const { c, membershipId, shop } = await leftLongAgo(45);
    const other = await customer();
    const call = (scope: Scope) =>
      withScope(scope, (q) =>
        q.execute<{ gold: number }>(
          sql`SELECT public.forfeit_own_left_progress(${membershipId}::uuid, ${newId()}::uuid) AS gold`,
        ),
      );
    // Another customer: nothing happens and nothing is revealed.
    expect(Number((await call(other.scope))[0]?.gold)).toBe(0);
    expect((await membershipRow(membershipId)).progressGold).toBe(420);
    // A shop team (even the shop's own owner) can't use it.
    const owner = await makeUser();
    await makeStaff(shop.id, owner.id, "owner");
    expect(
      await pgCode(() => call(mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }))),
    ).toBe("42501");
    expect((await membershipRow(membershipId)).progressGold).toBe(420);
    // The member themself: forfeit (420), then nothing more.
    expect(Number((await call(c.scope))[0]?.gold)).toBe(420);
    expect(Number((await call(c.scope))[0]?.gold)).toBe(0);
  });

  it("inside the window, or on a current membership, the wrapper changes nothing", async () => {
    const { c, membershipId } = await leftLongAgo(10);
    const call = () =>
      withScope(c.scope, (q) =>
        q.execute<{ gold: number }>(
          sql`SELECT public.forfeit_own_left_progress(${membershipId}::uuid, ${newId()}::uuid) AS gold`,
        ),
      );
    expect(Number((await call())[0]?.gold)).toBe(0);
    await db().update(memberships).set({ leftAt: null }).where(eq(memberships.id, membershipId));
    expect(Number((await call())[0]?.gold)).toBe(0);
    expect((await membershipRow(membershipId)).progressGold).toBe(420);
  });

  it("the web role can't run the job's forfeit or write expiry rows itself", async () => {
    const { c, membershipId, shop } = await leftLongAgo(45);
    expect(
      await pgCode(() =>
        withScope(c.scope, (q) =>
          q.execute(
            sql`SELECT public.apply_left_forfeit(${membershipId}::uuid, now(), ${newId()}::uuid)`,
          ),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(c.scope, (q) =>
          q.insert(ledgerEntries).values({
            membershipId,
            shopId: shop.id,
            type: "expiry",
            points: -420,
            idempotencyKey: `${membershipId}:forfeit:by-hand`,
            ref: { reason: "left" },
          }),
        ),
      ),
    ).toBe("42501");
    expect((await membershipRow(membershipId)).progressGold).toBe(420);
  });

  it("moz_forfeit: NOLOGIN, only its column grants, only the migrator is a member", async () => {
    const [role] = await db().execute<{ login: boolean; bypass: boolean }>(sql`
      SELECT rolcanlogin AS login, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'moz_forfeit'`);
    expect(role).toEqual({ login: false, bypass: false });
    const cols = await db().execute<{ t: string; p: string; c: string }>(sql`
      SELECT table_name AS t, privilege_type AS p, column_name AS c
      FROM information_schema.column_privileges WHERE grantee = 'moz_forfeit' ORDER BY 1, 2, 3`);
    expect([...cols].map((r) => `${r.t}.${r.p}.${r.c}`)).toEqual([
      "ledger_entries.INSERT.id",
      "ledger_entries.INSERT.idempotency_key",
      "ledger_entries.INSERT.membership_id",
      "ledger_entries.INSERT.points",
      "ledger_entries.INSERT.ref",
      "ledger_entries.INSERT.shop_id",
      "ledger_entries.INSERT.type",
      "memberships.SELECT.id",
      "memberships.SELECT.left_at",
      "memberships.SELECT.progress_gold",
      "memberships.SELECT.shop_id",
      "memberships.SELECT.user_id",
      "memberships.UPDATE.progress_gold",
      "memberships.UPDATE.updated_at",
    ]);
    const tables = await db().execute<{ t: string }>(sql`
      SELECT table_name AS t FROM information_schema.table_privileges WHERE grantee = 'moz_forfeit'`);
    expect([...tables]).toEqual([]);
    const members = await db().execute<{ member: string }>(sql`
      SELECT m.rolname AS member FROM pg_auth_members am
      JOIN pg_roles r ON r.oid = am.roleid JOIN pg_roles m ON m.oid = am.member
      WHERE r.rolname = 'moz_forfeit'`);
    const [me] = await db().execute<{ user: string }>(sql`SELECT current_user AS "user"`);
    expect([...members].map((m) => m.member)).toEqual([me?.user]);
  });
});
