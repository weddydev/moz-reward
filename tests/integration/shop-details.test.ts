import { eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeCollisionError, generateCode } from "@/lib/codes";
import {
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  publicScope,
  type Scope,
} from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { nfcTags, shopClosures, shopHours, shops } from "@/server/db/schema";
import { transaction, withScope } from "@/server/repos/_base";
import { normaliseTagUid, registerNfcTag, replaceNfcTag } from "@/server/repos/nfc-tags";
import { createShop, findActiveShopName } from "@/server/repos/shops";
import { opsAlert } from "@/server/security/alert";
import { makeAdmin, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

vi.mock("@/server/security/alert", () => ({ securityAlert: vi.fn(), opsAlert: vi.fn() }));

/** P1-01: shop codes, hours, closures and NFC tags against the real database and roles. */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

const uid = (): string =>
  Array.from({ length: 14 }, () => "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16))).join(
    "",
  );
const newShop = (name: string) => ({
  slug: `shop-${generateCode(10).toLowerCase()}`,
  name,
  category: "cafe",
  status: "active" as const,
});

let w: Awaited<ReturnType<typeof world>>;

async function world() {
  const [shopA, shopB, pending, ownerA, staffA, customer, support, moderator] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
    makeShop({ status: "pending" }),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await Promise.all([
    makeStaff(shopA.id, ownerA.id, "owner"),
    makeStaff(shopA.id, staffA.id, "staff"),
    makeAdmin(support.id, "support"),
    makeAdmin(moderator.id, "moderator"),
  ]);
  const hours = (shopId: string) => ({ shopId, weekday: 1, opens: "09:00", closes: "17:00" });
  await db()
    .insert(shopHours)
    .values([hours(shopA.id), hours(shopB.id), hours(pending.id)]);
  await db()
    .insert(shopClosures)
    .values([shopA.id, shopB.id, pending.id].map((shopId) => ({ shopId, date: "2026-12-25" })));
  const [tagA, tagB] = await db()
    .insert(nfcTags)
    .values([
      { shopId: shopA.id, tagUid: uid() },
      { shopId: shopB.id, tagUid: uid() },
    ])
    .returning();
  if (!tagA || !tagB) throw new Error("tags");
  return {
    shopA,
    shopB,
    pending,
    tagA,
    tagB,
    pub: publicScope("test: public shop details"),
    customer: mintCustomerScope({ userId: customer.id }),
    ownerA: mintShopScope({ userId: ownerA.id, shopId: shopA.id, role: "owner" }),
    staffA: mintShopScope({ userId: staffA.id, shopId: shopA.id, role: "staff" }),
    support: mintAdminScope({ userId: support.id, role: "support" }),
    moderator: mintAdminScope({ userId: moderator.id, role: "moderator" }),
  };
}

beforeAll(async () => {
  w = await world();
});
beforeEach(() => {
  vi.mocked(opsAlert).mockClear();
});

const visibleShops = async (scope: Scope, table: typeof shopHours | typeof shopClosures) =>
  (
    await withScope(scope, (q) =>
      q
        .select({ shopId: table.shopId })
        .from(table)
        .where(inArray(table.shopId, [w.shopA.id, w.shopB.id, w.pending.id])),
    )
  )
    .map((r) => r.shopId)
    .sort();

describe("[P1-01] shop codes", () => {
  it("concurrent creation never duplicates a code: the loser of a clash retries with a new one", async () => {
    const taken = generateCode(6);
    const seq =
      (...codes: string[]) =>
      () =>
        codes.shift() ?? generateCode(6);
    const [a, b] = await Promise.all([
      createShop(w.support, newShop("Clash A"), { generate: seq(taken, generateCode(6)) }),
      createShop(w.support, newShop("Clash B"), { generate: seq(taken, generateCode(6)) }),
    ]);
    expect(a.shopCode).not.toBe(b.shopCode);
    expect([a.shopCode, b.shopCode]).toContain(taken);
    const many = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createShop(w.support, newShop(`Bulk ${String(i)}`))),
    );
    expect(new Set(many.map((s) => s.shopCode)).size).toBe(20);
    for (const s of many) expect(s.shopCode).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("retries exhausted: fails loudly with an alert, creates nothing, never a shorter code", async () => {
    const err = await createShop(w.support, newShop("Never Created"), {
      generate: () => w.shopA.shopCode,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodeCollisionError);
    expect(vi.mocked(opsAlert)).toHaveBeenCalledWith("codes.exhausted", {
      kind: "shop_code",
      attempts: 5,
    });
    const rows = await db().select().from(shops).where(eq(shops.name, "Never Created"));
    expect(rows).toEqual([]);
  });

  it("a clash inside the caller's transaction is retried in a savepoint; the transaction carries on", async () => {
    const out = await transaction(w.support, async (tx) => {
      const created = await createShop(w.support, newShop("In Tx"), {
        tx,
        generate: (() => {
          const codes = [w.shopB.shopCode, generateCode(6)];
          return () => codes.shift() ?? generateCode(6);
        })(),
      });
      const [again] = await tx.select({ id: shops.id }).from(shops).where(eq(shops.id, created.id));
      return again;
    });
    expect(out).toBeDefined();
  });

  it("only admin owner/support create shops (RLS), and no web role can create a malformed code", async () => {
    for (const scope of [w.moderator, w.ownerA, w.customer]) {
      expect(await pgCode(() => createShop(scope as typeof w.support, newShop("Nope")))).toBe(
        "42501",
      );
    }
    expect(
      await pgCode(() =>
        db()
          .insert(shops)
          .values({ ...newShop("Bad"), shopCode: "ABC12" }),
      ),
    ).toBe("23514");
  });

  it("lookup normalises case, spaces and a dash; impossible codes return null", async () => {
    const name = w.shopA.tradingName ?? w.shopA.name;
    const code = w.shopA.shopCode;
    expect(await findActiveShopName(code.toLowerCase())).toBe(name);
    expect(await findActiveShopName(`  ${code.slice(0, 3)}-${code.slice(3)} `)).toBe(name);
    expect(await findActiveShopName("K7Q4OM")).toBeNull();
    expect(await findActiveShopName(w.pending.shopCode)).toBeNull();
  });

  it("shops.phone accepts E.164 only", async () => {
    expect(
      await pgCode(() =>
        db().update(shops).set({ phone: "07700 900123" }).where(eq(shops.id, w.shopB.id)),
      ),
    ).toBe("23514");
    await db().update(shops).set({ phone: "+447700900123" }).where(eq(shops.id, w.shopB.id));
  });
});

describe("[P1-01] hours and closures: visible like the shop, written by its owner or admin support", () => {
  it("public and customers see active shops' rows, not a pending shop's", async () => {
    for (const table of [shopHours, shopClosures]) {
      for (const scope of [w.pub, w.customer]) {
        expect(await visibleShops(scope, table)).toEqual([w.shopA.id, w.shopB.id].sort());
      }
      expect(await visibleShops(w.support, table)).toEqual(
        [w.shopA.id, w.shopB.id, w.pending.id].sort(),
      );
    }
  });

  it("the owner writes their own shop's hours and closures; never another shop's", async () => {
    const [row] = await withScope(w.ownerA, (q) =>
      q
        .insert(shopHours)
        .values({ shopId: w.shopA.id, weekday: 2, opens: "18:00", closes: "02:00" })
        .returning({ id: shopHours.id }),
    );
    expect(row).toBeDefined();
    expect(
      await pgCode(() =>
        withScope(w.ownerA, (q) =>
          q
            .insert(shopHours)
            .values({ shopId: w.shopB.id, weekday: 2, opens: "09:00", closes: "10:00" }),
        ),
      ),
    ).toBe("42501");
    const moved = await withScope(w.ownerA, (q) =>
      q
        .update(shopClosures)
        .set({ note: "x" })
        .where(eq(shopClosures.shopId, w.shopB.id))
        .returning(),
    );
    expect(moved).toEqual([]);
    const deleted = await withScope(w.ownerA, (q) =>
      q.delete(shopClosures).where(eq(shopClosures.shopId, w.shopB.id)).returning(),
    );
    expect(deleted).toEqual([]);
  });

  it("staff, customers, the public and a moderator can't write; admin support can", async () => {
    const insert = (scope: Scope) => () =>
      withScope(scope, (q) =>
        q.insert(shopClosures).values({ shopId: w.shopA.id, date: "2027-01-01" }),
      );
    for (const scope of [w.staffA, w.customer, w.pub, w.moderator]) {
      expect(await pgCode(insert(scope)), scope.kind).toBe("42501");
    }
    expect(await pgCode(insert(w.support))).toBeUndefined();
  });

  it("the database refuses an empty window, a weekday outside 1–7 and a second row for the same date", async () => {
    const at = (v: Partial<typeof shopHours.$inferInsert>) => () =>
      db()
        .insert(shopHours)
        .values({ shopId: w.shopB.id, weekday: 3, opens: "09:00", closes: "17:00", ...v });
    expect(await pgCode(at({ closes: "09:00" }))).toBe("23514");
    expect(await pgCode(at({ weekday: 0 }))).toBe("23514");
    expect(await pgCode(at({ weekday: 8 }))).toBe("23514");
    expect(
      await pgCode(() =>
        db().insert(shopClosures).values({ shopId: w.shopB.id, date: "2026-12-25" }),
      ),
    ).toBe("23505");
  });
});

describe("[P1-01] NFC tags", () => {
  it("the shop's team sees its own tags only; customers and the public see none; admins see all", async () => {
    const seen = async (scope: Scope) =>
      (
        await withScope(scope, (q) =>
          q
            .select({ id: nfcTags.id })
            .from(nfcTags)
            .where(inArray(nfcTags.id, [w.tagA.id, w.tagB.id])),
        )
      ).map((r) => r.id);
    expect(await seen(w.staffA)).toEqual([w.tagA.id]);
    expect(await seen(w.customer)).toEqual([]);
    expect(await seen(w.pub)).toEqual([]);
    expect((await seen(w.moderator)).sort()).toEqual([w.tagA.id, w.tagB.id].sort());
  });

  it("only admin owner/support register tags; the web role can never delete one", async () => {
    for (const scope of [w.moderator]) {
      expect(await pgCode(() => registerNfcTag(scope, { shopId: w.shopA.id, tagUid: uid() }))).toBe(
        "42501",
      );
    }
    expect(
      await pgCode(() =>
        withScope(w.ownerA, (q) => q.insert(nfcTags).values({ shopId: w.shopA.id, tagUid: uid() })),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(w.support, (q) => q.delete(nfcTags).where(eq(nfcTags.id, w.tagA.id))),
      ),
    ).toBe("42501");
  });

  it("normalises tag IDs and refuses impossible ones", async () => {
    expect(normaliseTagUid("04:a2:3b:4c:5d:6e:7f")).toBe("04A23B4C5D6E7F");
    expect(normaliseTagUid("04A23B4C5D6E7")).toBeNull();
    await expect(
      registerNfcTag(w.support, { shopId: w.shopA.id, tagUid: "not-a-tag" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("a tag replaced twice: every old tag points straight at the current one (one hop)", async () => {
    const first = await registerNfcTag(w.support, { shopId: w.shopB.id, tagUid: uid() });
    const second = await replaceNfcTag(w.support, { tagId: first.id, newTagUid: uid() });
    const third = await replaceNfcTag(w.support, { tagId: second.id, newTagUid: uid() });
    const rows = await db()
      .select({ id: nfcTags.id, status: nfcTags.status, replacedBy: nfcTags.replacedBy })
      .from(nfcTags)
      .where(inArray(nfcTags.id, [first.id, second.id, third.id]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(first.id)).toMatchObject({ status: "replaced", replacedBy: third.id });
    expect(byId.get(second.id)).toMatchObject({ status: "replaced", replacedBy: third.id });
    expect(byId.get(third.id)).toMatchObject({ status: "active", replacedBy: null });
    await expect(
      replaceNfcTag(w.support, { tagId: first.id, newTagUid: uid() }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("the database refuses a chain, a pointer to another shop's tag and a status without a pointer", async () => {
    const [a, b, c, other] = await db()
      .insert(nfcTags)
      .values([
        { shopId: w.shopA.id, tagUid: uid() },
        { shopId: w.shopA.id, tagUid: uid() },
        { shopId: w.shopA.id, tagUid: uid() },
        { shopId: w.shopB.id, tagUid: uid() },
      ])
      .returning({ id: nfcTags.id });
    if (!a || !b || !c || !other) throw new Error("tags");
    // b → c, then a → b: a would point at a replaced tag.
    await db()
      .update(nfcTags)
      .set({ status: "replaced", replacedBy: c.id })
      .where(eq(nfcTags.id, b.id));
    expect(
      await pgCode(() =>
        db()
          .update(nfcTags)
          .set({ status: "replaced", replacedBy: b.id })
          .where(eq(nfcTags.id, a.id)),
      ),
    ).toBe("23514");
    expect(
      await pgCode(() =>
        db()
          .update(nfcTags)
          .set({ status: "replaced", replacedBy: other.id })
          .where(eq(nfcTags.id, a.id)),
      ),
    ).toBe("23514");
    expect(
      await pgCode(() =>
        db().update(nfcTags).set({ status: "replaced" }).where(eq(nfcTags.id, a.id)),
      ),
    ).toBe("23514");
    // Replacing c (b's target) without re-pointing b is refused at commit.
    const [d] = await db()
      .insert(nfcTags)
      .values({ shopId: w.shopA.id, tagUid: uid() })
      .returning();
    expect(
      await pgCode(() =>
        db()
          .update(nfcTags)
          .set({ status: "replaced", replacedBy: d?.id })
          .where(eq(nfcTags.id, c.id)),
      ),
    ).toBe("23514");
  });

  it("tag UIDs are unique and well-formed", async () => {
    const [{ tagUid } = { tagUid: "" }] = await db()
      .select({ tagUid: nfcTags.tagUid })
      .from(nfcTags)
      .where(eq(nfcTags.id, w.tagA.id));
    expect(await pgCode(() => db().insert(nfcTags).values({ shopId: w.shopB.id, tagUid }))).toBe(
      "23505",
    );
    expect(
      await pgCode(() => db().insert(nfcTags).values({ shopId: w.shopB.id, tagUid: "04a2" })),
    ).toBe("23514");
  });
});
