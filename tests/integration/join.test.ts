import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MARKETING_CONSENT_VERSION, marketingConsentText } from "@/features/join/consent";
import { mintCustomerScope, mintShopScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { customerProfiles, marketingConsents, memberships } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { transaction, withScope } from "@/server/repos/_base";
import { recordConsentChange } from "@/server/repos/consents";
import { createOwnProfile, readOwnProfile } from "@/server/repos/profiles";
import { keyIdOf } from "@/server/security/field-crypto";
import { phoneBlindIndex } from "@/server/security/field-keys";
import { joinShop, type JoinInput } from "@/server/services/join";
import { makeMembership, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P1-04: "Collect points" → profile (if missing) → membership (idempotent) → consent record, in one
 * transaction; and the database walls behind it (0020): consent rows required for marketing_opt_in, append-only
 * consent history, shops not taking members, phone sealed with a key id and a blind index.
 */

type Shop = Awaited<ReturnType<typeof makeShop>>;
const PHONE = "+447400123456";
const profile = (over: Partial<NonNullable<JoinInput["profile"]>> = {}) => ({
  fullName: "Aisha Khan",
  phoneE164: PHONE,
  birthday: { day: 29, month: 2 },
  ...over,
});

async function customer() {
  const user = await makeUser();
  return { id: user.id, scope: mintCustomerScope({ userId: user.id }) };
}

const join = (c: Awaited<ReturnType<typeof customer>>, shop: Shop, over: Partial<JoinInput> = {}) =>
  transaction(c.scope, (tx) =>
    joinShop(
      c.scope,
      {
        shopCode: shop.shopCode,
        marketingOptIn: false,
        consentVersion: MARKETING_CONSENT_VERSION,
        profile: profile(),
        ...over,
      },
      tx,
    ),
  );

const consentsOf = (userId: string) =>
  db()
    .select()
    .from(marketingConsents)
    .where(eq(marketingConsents.userId, userId))
    .orderBy(marketingConsents.createdAt, marketingConsents.id);

const membershipsOf = (userId: string) =>
  db().select().from(memberships).where(eq(memberships.userId, userId));

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

describe("[P1-04] join flow", () => {
  it("first join creates the profile (sealed phone, key id, blind index), the membership and a consent row", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active", name: "Brew & Bloom Café" });
    const result = await join(c, shop);
    expect(result).toMatchObject({ shopId: shop.id, firstJoin: true });
    expect(result.memberId).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);

    const [row] = await db()
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, c.id));
    expect(row?.phoneEnc).toMatch(/^v1\./);
    expect(row?.phoneEnc).not.toContain("7400123456");
    expect(row?.phoneKeyId).toBe(keyIdOf(env().DATA_ENCRYPTION_KEY));
    expect(row?.phoneHash).toBe(phoneBlindIndex(PHONE));
    expect(row?.ageDeclaredAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({ birthdayDay: 29, birthdayMonth: 2, isAdultConfirmed: false });

    expect(await readOwnProfile(c.scope)).toEqual({
      fullName: "Aisha Khan",
      memberId: result.memberId,
      phoneE164: PHONE,
      birthday: { day: 29, month: 2 },
    });

    const [m] = await membershipsOf(c.id);
    expect(m).toMatchObject({ shopId: shop.id, marketingOptIn: false, leftAt: null });
    const consents = await consentsOf(c.id);
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      membershipId: m?.id,
      shopId: shop.id,
      optedIn: false,
      source: "join",
      wordingVersion: MARKETING_CONSENT_VERSION,
      wordingHash: createHash("sha256")
        .update(marketingConsentText("Brew & Bloom Café"))
        .digest("hex"),
      actorId: c.id,
    });
  });

  it("stores marketing_opt_in true only when ticked, with a matching consent row", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await join(c, shop, { marketingOptIn: true });
    expect((await membershipsOf(c.id))[0]?.marketingOptIn).toBe(true);
    expect((await consentsOf(c.id)).map((r) => r.optedIn)).toEqual([true]);
  });

  it("re-scanning a joined shop never creates a second membership or consent row, and changes nothing", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const first = await join(c, shop, { marketingOptIn: true });
    const again = await join(c, shop, { marketingOptIn: false, profile: null });
    expect(again).toMatchObject({ membershipId: first.membershipId, firstJoin: false });
    expect(await membershipsOf(c.id)).toHaveLength(1);
    expect((await membershipsOf(c.id))[0]?.marketingOptIn).toBe(true);
    expect(await consentsOf(c.id)).toHaveLength(1);
  });

  it("parallel joins of the same shop: one profile, one membership, one consent row", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const results = await Promise.all(Array.from({ length: 6 }, () => join(c, shop)));
    expect(new Set(results.map((r) => r.membershipId)).size).toBe(1);
    expect(new Set(results.map((r) => r.memberId)).size).toBe(1);
    expect(results.filter((r) => r.firstJoin)).toHaveLength(1);
    expect(await membershipsOf(c.id)).toHaveLength(1);
    expect(await consentsOf(c.id)).toHaveLength(1);
  });

  it("parallel first joins of two shops: one profile (the loser's input discarded), two memberships", async () => {
    const c = await customer();
    const [a, b] = await Promise.all([
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
    ]);
    const [ra, rb] = await Promise.all([
      join(c, a, { profile: profile({ fullName: "First Name" }) }),
      join(c, b, { profile: profile({ fullName: "Second Name" }) }),
    ]);
    expect(ra.memberId).toBe(rb.memberId);
    const rows = await db()
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, c.id));
    expect(rows).toHaveLength(1);
    expect(["First Name", "Second Name"]).toContain(rows[0]?.fullName);
    expect(await membershipsOf(c.id)).toHaveLength(2);
    expect(await consentsOf(c.id)).toHaveLength(2);
  });

  it("an existing profile is never overwritten through join", async () => {
    const c = await customer();
    const [a, b] = await Promise.all([
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
    ]);
    await join(c, a);
    await join(c, b, {
      profile: profile({ fullName: "Someone Else", phoneE164: "+447400999888" }),
    });
    expect(await readOwnProfile(c.scope)).toMatchObject({
      fullName: "Aisha Khan",
      phoneE164: PHONE,
    });
  });

  it("no profile and none given: refused, nothing stored", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    await expect(join(c, shop, { profile: null })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await membershipsOf(c.id)).toHaveLength(0);
  });

  it("refuses suspended and closed shops with a message, pending and unknown codes as not found; restricted is allowed", async () => {
    const c = await customer();
    for (const status of ["suspended", "closed"] as const) {
      const shop = await makeShop({ status });
      await expect(join(c, shop)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringContaining("isn't taking new members") as unknown,
      });
    }
    await expect(join(c, await makeShop({ status: "pending" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      join(c, { shopCode: "ZZZZZZ" } as Shop, { profile: profile() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Nothing stored by the refused joins, not even the profile (one transaction).
    expect(await readOwnProfile(c.scope)).toBeNull();
    expect((await join(c, await makeShop({ status: "restricted" }))).firstJoin).toBe(true);
  });

  it("refuses an answer given to an outdated consent wording", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const err = await join(c, shop, { consentVersion: "2020-01-01" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: "CONFLICT" });
    expect(await membershipsOf(c.id)).toHaveLength(0);
  });

  it("re-opens a left membership: asks again, records a 'rejoin' consent, never restores the old opt-in", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const first = await join(c, shop, { marketingOptIn: true });
    await db()
      .update(memberships)
      .set({ leftAt: new Date() })
      .where(eq(memberships.id, first.membershipId));
    const again = await join(c, shop, { marketingOptIn: false, profile: null });
    expect(again).toMatchObject({ membershipId: first.membershipId, firstJoin: true });
    expect((await membershipsOf(c.id))[0]).toMatchObject({ leftAt: null, marketingOptIn: false });
    expect((await consentsOf(c.id)).map((r) => [r.source, r.optedIn])).toEqual([
      ["join", true],
      ["rejoin", false],
    ]);
  });

  it("member ID: retries a collision inside the transaction, fails loudly when exhausted", async () => {
    const taken = await customer();
    const shop = await makeShop({ status: "active" });
    const { memberId } = await join(taken, shop);
    const c = await customer();
    const codes = [memberId, memberId, "ABC234"];
    const made = await transaction(c.scope, (tx) =>
      createOwnProfile(c.scope, profile(), tx, { generate: () => codes.shift() ?? "XYZ789" }),
    );
    expect(made).toEqual({ memberId: "ABC234", created: true });
    const d = await customer();
    await expect(
      transaction(d.scope, (tx) =>
        createOwnProfile(d.scope, profile(), tx, { generate: () => memberId }),
      ),
    ).rejects.toThrow(/after 5 attempts/);
    expect(await readOwnProfile(d.scope)).toBeNull();
  });

  it("blind-index lookup finds the profile by phone number, and two customers may share a number", async () => {
    const [a, b] = await Promise.all([customer(), customer()]);
    const shop = await makeShop({ status: "active" });
    const shared = "+447400555666";
    await join(a, shop, { profile: profile({ phoneE164: shared }) });
    await join(b, shop, { profile: profile({ phoneE164: shared }) });
    const found = await db()
      .select({ userId: customerProfiles.userId })
      .from(customerProfiles)
      .where(eq(customerProfiles.phoneHash, phoneBlindIndex(shared)));
    expect(found.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
  });
});

describe("[P1-04] consent walls (0020)", () => {
  it("refuses a marketing_opt_in change without a consent row from the same transaction", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const { membershipId } = await join(c, shop);
    const flip = () =>
      withScope(c.scope, (q) =>
        q.update(memberships).set({ marketingOptIn: true }).where(eq(memberships.id, membershipId)),
      );
    expect(await pgCode(flip)).toBe("23000");
    // Even the owner role (migrations, tests): the consent rule binds every writer.
    expect(
      await pgCode(() =>
        db()
          .update(memberships)
          .set({ marketingOptIn: true })
          .where(eq(memberships.id, membershipId)),
      ),
    ).toBe("23000");
    expect((await membershipsOf(c.id))[0]?.marketingOptIn).toBe(false);

    await transaction(c.scope, async (tx) => {
      await withScope(
        c.scope,
        (q) =>
          q
            .update(memberships)
            .set({ marketingOptIn: true })
            .where(eq(memberships.id, membershipId)),
        tx,
      );
      await recordConsentChange(
        c.scope,
        { membershipId, shopId: shop.id, optedIn: true, source: "settings", shopName: shop.name },
        tx,
      );
    });
    expect((await membershipsOf(c.id))[0]?.marketingOptIn).toBe(true);
  });

  it("refuses a consent row whose value disagrees with the membership, and going back to 'not asked'", async () => {
    const c = await customer();
    const shop = await makeShop({ status: "active" });
    const { membershipId } = await join(c, shop);
    const mismatched = () =>
      transaction(c.scope, async (tx) => {
        await withScope(
          c.scope,
          (q) =>
            q
              .update(memberships)
              .set({ marketingOptIn: true })
              .where(eq(memberships.id, membershipId)),
          tx,
        );
        await recordConsentChange(
          c.scope,
          {
            membershipId,
            shopId: shop.id,
            optedIn: false,
            source: "settings",
            shopName: shop.name,
          },
          tx,
        );
      });
    expect(await pgCode(mismatched)).toBe("23000");
    const unasked = () =>
      withScope(c.scope, (q) =>
        q.update(memberships).set({ marketingOptIn: null }).where(eq(memberships.id, membershipId)),
      );
    expect(await pgCode(unasked)).toBe("23000");
  });

  it("consent rows are append-only and take user/shop from the membership", async () => {
    const c = await customer();
    const other = await customer();
    const shop = await makeShop({ status: "active" });
    const { membershipId } = await join(c, shop);
    const [row] = await consentsOf(c.id);
    expect(
      await pgCode(() =>
        db()
          .update(marketingConsents)
          .set({ optedIn: true })
          .where(eq(marketingConsents.id, row?.id ?? "")),
      ),
    ).toBe("23001");
    expect(
      await pgCode(() =>
        db()
          .delete(marketingConsents)
          .where(eq(marketingConsents.id, row?.id ?? "")),
      ),
    ).toBe("23001");
    // Another customer can't add a consent row to this membership (RLS hides it: "unknown membership").
    const forged = () =>
      withScope(other.scope, (q) =>
        q.insert(marketingConsents).values({
          membershipId,
          userId: other.id,
          shopId: shop.id,
          optedIn: true,
          source: "settings",
          wordingVersion: MARKETING_CONSENT_VERSION,
          wordingHash: "0".repeat(64),
        }),
      );
    expect(await pgCode(forged)).toBe("23503");
    // Wrong user/shop given by the writer are replaced by the membership's own.
    await transaction(c.scope, (tx) =>
      withScope(
        c.scope,
        (q) =>
          q.insert(marketingConsents).values({
            membershipId,
            userId: c.id,
            shopId: other.id,
            optedIn: false,
            source: "settings",
            wordingVersion: MARKETING_CONSENT_VERSION,
            wordingHash: "0".repeat(64),
            createdAt: new Date("2020-01-01T00:00:00Z"),
          }),
        tx,
      ),
    );
    const rows = await consentsOf(c.id);
    expect(rows.at(-1)).toMatchObject({ shopId: shop.id, userId: c.id });
    expect(rows.at(-1)?.createdAt.getUTCFullYear()).toBeGreaterThan(2020);
  });

  it("consent rows: the shop's team reads its own shop's, not another shop's", async () => {
    const c = await customer();
    const [a, b] = await Promise.all([
      makeShop({ status: "active" }),
      makeShop({ status: "active" }),
    ]);
    await join(c, a);
    await join(c, b, { profile: null });
    const staffer = await makeUser();
    await makeStaff(a.id, staffer.id, "staff");
    const staffA = mintShopScope({ userId: staffer.id, shopId: a.id, role: "staff" });
    const seen = await withScope(staffA, (q) =>
      q.select({ shopId: marketingConsents.shopId }).from(marketingConsents),
    );
    expect(seen.map((r) => r.shopId)).toEqual([a.id]);
    // Staff can't change a member's opt-in: they can't write the consent row it needs.
    const [m] = await db()
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, c.id), eq(memberships.shopId, a.id)));
    expect(
      await pgCode(() =>
        withScope(staffA, (q) =>
          q
            .update(memberships)
            .set({ marketingOptIn: true })
            .where(eq(memberships.id, m?.id ?? "")),
        ),
      ),
    ).toBe("23000");
  });

  it("the database refuses a customer joining a suspended, closed or pending shop directly", async () => {
    const c = await customer();
    for (const status of ["suspended", "closed", "pending"] as const) {
      const shop = await makeShop({ status });
      const insert = () =>
        withScope(c.scope, (q) => q.insert(memberships).values({ userId: c.id, shopId: shop.id }));
      expect(await pgCode(insert), status).toBe("42501");
    }
    // Seeds and the worker are not limited (they don't run as moz_app).
    const suspended = await makeShop({ status: "suspended" });
    await expect(makeMembership(c.id, suspended.id)).resolves.toBeTruthy();
    const count = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM memberships WHERE user_id = ${c.id}`,
    );
    expect(count[0]?.n).toBe(1);
  });
});
