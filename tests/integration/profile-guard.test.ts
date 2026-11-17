import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mintCustomerScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { customerProfiles } from "@/server/db/schema";
import { withScope } from "@/server/repos/_base";
import { makeCustomerProfile, makeUser } from "@/server/testing/factories";

/**
 * P1-04 (security design check M5): customer_profiles is "own row FOR ALL" under RLS, so a guard trigger (0020)
 * decides the columns. member_id, user_id, created_at and a set age_declared_at never change, for any role; a
 * customer may change only the profile fields and can't set the 18+ columns or the 13+ time.
 */

const CLASSIFIED = {
  identity: ["user_id", "member_id"],
  customerWritable: [
    "full_name",
    "phone_enc",
    "phone_key_id",
    "phone_hash",
    "birthday_day",
    "birthday_month",
    "sound_on",
    "reduce_motion",
  ],
  dbMaintained: ["updated_at"],
  serverOwned: ["is_adult_confirmed", "adult_confirmed_at", "age_declared_at", "created_at"],
} as const;

async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function profiled() {
  const user = await makeUser();
  const row = await makeCustomerProfile(user.id, { ageDeclaredAt: new Date() });
  return { row, scope: mintCustomerScope({ userId: user.id }) };
}

const update = (
  scope: ReturnType<typeof mintCustomerScope>,
  set: Partial<typeof customerProfiles.$inferInsert>,
) =>
  withScope(scope, (q) =>
    q
      .update(customerProfiles)
      .set(set)
      .where(eq(customerProfiles.userId, scope.userId))
      .returning({ userId: customerProfiles.userId }),
  );

describe("[P1-04] customer_profiles guard", () => {
  it("classifies every customer_profiles column (catalog)", async () => {
    const rows = await db().execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'customer_profiles' ORDER BY column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(Object.values(CLASSIFIED).flat().sort());
  });

  it("lets a customer change their name, birthday and preferences", async () => {
    const p = await profiled();
    expect(
      await update(p.scope, {
        fullName: "Aisha K",
        birthdayDay: 1,
        birthdayMonth: 3,
        soundOn: false,
      }),
    ).toHaveLength(1);
  });

  it("refuses a customer setting the 18+ flag, the 13+ time or the creation time", async () => {
    const p = await profiled();
    for (const set of [
      { isAdultConfirmed: true },
      { adultConfirmedAt: new Date() },
      { ageDeclaredAt: new Date("2020-01-01T00:00:00Z") },
      { createdAt: new Date("2020-01-01T00:00:00Z") },
    ] satisfies Partial<typeof customerProfiles.$inferInsert>[]) {
      expect(await pgCode(() => update(p.scope, set)), JSON.stringify(set)).toMatch(
        /^(42501|23001)$/,
      );
    }
  });

  it("never changes member_id or user_id, for any role (owner included)", async () => {
    const p = await profiled();
    expect(await pgCode(() => update(p.scope, { memberId: "ABC234" }))).toBe("23001");
    expect(
      await pgCode(() =>
        db()
          .update(customerProfiles)
          .set({ memberId: "ABC234" })
          .where(eq(customerProfiles.userId, p.row.userId)),
      ),
    ).toBe("23001");
    const [row] = await db()
      .select({ memberId: customerProfiles.memberId })
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, p.row.userId));
    expect(row?.memberId).toBe(p.row.memberId);
  });

  it("refuses a customer inserting a profile that claims 18+ or a back-dated 13+ declaration", async () => {
    for (const over of [
      { isAdultConfirmed: true, ageDeclaredAt: sql`now()` },
      { ageDeclaredAt: new Date("2020-01-01T00:00:00Z") },
      {},
    ]) {
      const user = await makeUser();
      const scope = mintCustomerScope({ userId: user.id });
      const insert = () =>
        withScope(scope, (q) =>
          q.insert(customerProfiles).values({
            userId: user.id,
            fullName: "Test",
            memberId: "MNP234",
            ...over,
          } as typeof customerProfiles.$inferInsert),
        );
      expect(await pgCode(insert), JSON.stringify(Object.keys(over))).toBe("42501");
    }
  });

  it("keeps phone ciphertext, key id and blind index together", async () => {
    const p = await profiled();
    expect(await pgCode(() => update(p.scope, { phoneEnc: "v1.AAAA", phoneKeyId: null }))).toBe(
      "23514",
    );
  });
});
