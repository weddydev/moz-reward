import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  ingotTerms,
  type ProgrammeRules,
  rewardsVersionAt,
  TEMPLATES,
} from "@/lib/loyalty/programme";
import {
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  type ShopScope,
} from "@/server/authz/scope";
import { dbAs, testOwnerDb as db } from "@/server/db/client";
import { loyaltyPrograms, memberships } from "@/server/db/schema";
import { isAppError } from "@/server/errors";
import { transaction, withScope } from "@/server/repos/_base";
import { insertProgrammeVersion, listProgrammeVersions } from "@/server/repos/loyalty";
import { saveProgramme } from "@/server/services/loyalty-programme";
import {
  makeAdmin,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";

/**
 * P1-05: versioned loyalty programmes. A save appends one immutable version and writes nothing else; the
 * current ingot keeps its terms; reward and milestone changes apply 14 days after the save (injected clock).
 */
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-11-02T10:00:00Z");
const day = (n: number): Date => new Date(T0.getTime() + n * DAY);
const BASE: ProgrammeRules = TEMPLATES.cafe.rules;

async function shopWithTeam() {
  const shop = await makeShop();
  const owner = await makeUser();
  const staff = await makeUser();
  await makeStaff(shop.id, owner.id, "owner");
  await makeStaff(shop.id, staff.id, "staff", { perAwardLimit: 100 });
  return {
    shop,
    owner: mintShopScope({ userId: owner.id, shopId: shop.id, role: "owner" }),
    staff: mintShopScope({ userId: staff.id, shopId: shop.id, role: "staff" }),
  };
}

const save = (scope: ShopScope, baseVersion: number, rules: ProgrammeRules, now: Date) =>
  transaction(scope, (tx) => saveProgramme(scope, { baseVersion, rules }, tx, now));

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function appCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    if (isAppError(err)) return err.code;
    throw err;
  }
  return undefined;
}

describe("[P1-05] saving creates a new immutable version", () => {
  it("first save is version 1, rewards in force at once; each change appends the next version", async () => {
    const { owner } = await shopWithTeam();
    const v1 = await save(owner, 0, BASE, T0);
    expect(v1).toMatchObject({ kind: "saved", version: 1, changes: ["Programme set up"] });
    if (v1.kind === "saved") expect(v1.rewardsFrom).toEqual(T0);

    const v2 = await save(owner, 1, { ...BASE, earnRate: 120 }, day(1));
    expect(v2).toMatchObject({
      kind: "saved",
      version: 2,
      changes: ["Earning: 100 gold per visit → 120 gold per visit"],
    });
    if (v2.kind === "saved") expect(v2.rewardsFrom).toEqual(day(1));

    const versions = await listProgrammeVersions(owner);
    expect(versions.map((v) => [v.version, v.earnRate])).toEqual([
      [1, 100],
      [2, 120],
    ]);
  });

  it("saving identical rules creates no version", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    expect(await save(owner, 1, { ...BASE }, day(1))).toEqual({ kind: "unchanged", version: 1 });
    expect(await listProgrammeVersions(owner)).toHaveLength(1);
  });

  it("a stale form (base version not the latest) is refused with CONFLICT and saves nothing", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    await save(owner, 1, { ...BASE, earnRate: 150 }, day(1));
    expect(await appCode(() => save(owner, 1, { ...BASE, earnRate: 90 }, day(2)))).toBe("CONFLICT");
    expect(await appCode(() => save(owner, 0, BASE, day(2)))).toBe("CONFLICT");
    expect(await listProgrammeVersions(owner)).toHaveLength(2);
  });

  it("two saves at the same moment from the same base: one wins, the other gets CONFLICT", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    const results = await Promise.allSettled([
      save(owner, 1, { ...BASE, earnRate: 110 }, day(1)),
      save(owner, 1, { ...BASE, earnRate: 130 }, day(1)),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason as unknown;
    expect(isAppError(reason) && reason.code).toBe("CONFLICT");
    expect((await listProgrammeVersions(owner)).map((v) => v.version)).toEqual([1, 2]);
  });

  it("a version can't be updated by anyone, nor deleted by the web role", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    const [row] = await db()
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.shopId, owner.shopId));
    if (!row) throw new Error("no row");
    // Owner of the tables (migrations) and the worker: the trigger refuses.
    expect(
      await pgCode(() =>
        db().update(loyaltyPrograms).set({ earnRate: 1 }).where(eq(loyaltyPrograms.id, row.id)),
      ),
    ).toBe("23001");
    expect(
      await pgCode(() =>
        dbAs("system")
          .update(loyaltyPrograms)
          .set({ earnRate: 1 })
          .where(eq(loyaltyPrograms.id, row.id)),
      ),
    ).toBe("23001");
    // The web role, even as the shop's owner: no UPDATE or DELETE privilege.
    for (const stmt of [
      sql`UPDATE loyalty_programs SET earn_rate = 1 WHERE id = ${row.id}`,
      sql`DELETE FROM loyalty_programs WHERE id = ${row.id}`,
    ]) {
      expect(await pgCode(() => withScope(owner, (q) => q.execute(stmt)))).toBe("42501");
    }
    const [after] = await db().select().from(loyaltyPrograms).where(eq(loyaltyPrograms.id, row.id));
    expect(after?.earnRate).toBe(100);
  });

  it("deleting a shop still removes its versions (demo reset)", async () => {
    const { owner, shop } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    await db().execute(sql`DELETE FROM shops WHERE id = ${shop.id}`);
    const left = await db()
      .select()
      .from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.shopId, shop.id));
    expect(left).toEqual([]);
  });

  it("the database refuses out-of-range values even past the app", async () => {
    const { owner } = await shopWithTeam();
    const bad: Array<Partial<ProgrammeRules>> = [
      { earnRate: 0 },
      { earnMode: "per_pound", earnRate: 101 },
      { ingotSize: 99 },
      { expiryMonths: 6 },
      { tiers: { silver: 5, gold: 5 } },
      { streak: { bonusGold: 0 } },
    ];
    for (const patch of bad) {
      const code = await pgCode(() =>
        transaction(owner, (tx) =>
          insertProgrammeVersion(owner, tx, {
            version: 1,
            rules: { ...BASE, ...patch },
            activeFrom: T0,
            rewardsFrom: T0,
          }),
        ),
      );
      expect(code, JSON.stringify(patch)).toBe("23514");
    }
  });
});

describe("[P1-05] who may read and write (RLS second wall)", () => {
  it("staff read their shop's programme but can't insert a version", async () => {
    const { owner, staff } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    expect(await listProgrammeVersions(staff)).toHaveLength(1);
    expect(await appCode(() => save(staff, 1, { ...BASE, earnRate: 300 }, day(1)))).toBe(
      "FORBIDDEN",
    );
    // Past the service check, straight to the repository: RLS refuses.
    expect(
      await pgCode(() =>
        transaction(staff, (tx) =>
          insertProgrammeVersion(staff, tx, {
            version: 2,
            rules: BASE,
            activeFrom: day(1),
            rewardsFrom: day(1),
          }),
        ),
      ),
    ).toBe("42501");
  });

  it("another shop's owner sees nothing and can't write into this shop", async () => {
    const a = await shopWithTeam();
    const b = await shopWithTeam();
    await save(a.owner, 0, BASE, T0);
    expect(await listProgrammeVersions(b.owner)).toEqual([]);
    // B's owner forging A's shop id in raw SQL under B's scope.
    const forged = sql`INSERT INTO loyalty_programs (id, shop_id, version, earn_mode, earn_rate, ingot_size,
      main_reward, milestones, tiers, active_from, rewards_from, created_by)
      VALUES (gen_random_uuid(), ${a.shop.id}, 9, 'per_visit', 10, 1000, '{"text":"x"}', '[]',
      '{"silver":2,"gold":5}', now(), now(), ${b.owner.userId})`;
    expect(await pgCode(() => withScope(b.owner, (q) => q.execute(forged)))).toBe("42501");
  });

  it("an owner can't save a version in someone else's name", async () => {
    const { owner, staff } = await shopWithTeam();
    const forged = sql`INSERT INTO loyalty_programs (id, shop_id, version, earn_mode, earn_rate, ingot_size,
      main_reward, milestones, tiers, active_from, rewards_from, created_by)
      VALUES (gen_random_uuid(), ${owner.shopId}, 1, 'per_visit', 10, 1000, '{"text":"x"}', '[]',
      '{"silver":2,"gold":5}', now(), now(), ${staff.userId})`;
    expect(await pgCode(() => withScope(owner, (q) => q.execute(forged)))).toBe("42501");
  });

  it("customers see no programme rows yet; admins read them", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    const customer = mintCustomerScope({ userId: (await makeUser()).id });
    const rows = await withScope(customer, (q) =>
      q.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.shopId, owner.shopId)),
    );
    expect(rows).toEqual([]);
    const adminUser = await makeUser();
    await makeAdmin(adminUser.id, "support");
    const admin = mintAdminScope({ userId: adminUser.id, role: "support" });
    const seen = await withScope(admin, (q) =>
      q.select().from(loyaltyPrograms).where(eq(loyaltyPrograms.shopId, owner.shopId)),
    );
    expect(seen).toHaveLength(1);
  });
});

describe("[P1-05] programme change semantics", () => {
  it("a change mid-progress leaves the membership untouched; the current ingot keeps its size", async () => {
    const { owner, shop } = await shopWithTeam();
    const member = await makeUser();
    await save(owner, 0, BASE, T0);
    const membership = await makeMembership(member.id, shop.id, {
      joinedAt: day(1),
      purchaseCount: 9,
    });
    const before = await db().select().from(memberships).where(eq(memberships.id, membership.id));

    // One award from full (9 of 10 visits) when the owner doubles the ingot size.
    await save(owner, 1, { ...BASE, ingotSize: 2_000 }, day(5));

    const after = await db().select().from(memberships).where(eq(memberships.id, membership.id));
    expect(after).toEqual(before);
    const versions = await listProgrammeVersions(owner);
    // The ingot that started at the join fills under the old size; the next one uses the new size.
    expect(ingotTerms(versions, day(1))).toMatchObject({ ingotSize: 1_000, sizeVersion: 1 });
    expect(ingotTerms(versions, day(6))).toMatchObject({ ingotSize: 2_000, sizeVersion: 2 });
  });

  it("a reward change takes effect exactly 14 days after the save; earn changes at once", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    const v2 = await save(
      owner,
      1,
      { ...BASE, earnRate: 150, mainReward: { text: "Free cake" } },
      day(2),
    );
    expect(v2.kind === "saved" && v2.rewardsFrom).toEqual(day(16));

    const versions = await listProgrammeVersions(owner);
    expect(rewardsVersionAt(versions, new Date(day(16).getTime() - 1))?.mainReward.text).toBe(
      BASE.mainReward.text,
    );
    expect(rewardsVersionAt(versions, day(16))?.mainReward.text).toBe("Free cake");
    expect(versions[1]?.activeFrom).toEqual(day(2));
  });

  it("edit then revert inside the window: the revert applies at once and the change never does", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    await save(owner, 1, { ...BASE, milestones: [] }, day(1));
    const v3 = await save(owner, 2, BASE, day(3));
    expect(v3.kind === "saved" && v3.rewardsFrom).toEqual(day(3));
    const versions = await listProgrammeVersions(owner);
    expect(rewardsVersionAt(versions, day(30))?.milestones).toEqual(BASE.milestones);
  });

  it("a second change inside the window restarts its own notice", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, T0);
    await save(owner, 1, { ...BASE, mainReward: { text: "Cake" } }, day(1));
    const v3 = await save(owner, 2, { ...BASE, mainReward: { text: "Bun" } }, day(4));
    expect(v3.kind === "saved" && v3.rewardsFrom).toEqual(day(18));
  });

  it("a host clock behind the last save never dates a version earlier", async () => {
    const { owner } = await shopWithTeam();
    await save(owner, 0, BASE, day(2));
    const v2 = await save(owner, 1, { ...BASE, earnRate: 110 }, day(1));
    expect(v2.kind === "saved" && v2.activeFrom).toEqual(day(2));
  });
});
