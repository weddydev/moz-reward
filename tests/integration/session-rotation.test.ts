import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { testOwnerDb as db } from "@/server/db/client";
import { adminMembers, sessions, shopStaff, users } from "@/server/db/schema";
import { makeAdmin, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/** Adds a live session for a user (what a sign-in leaves behind) and returns its token. */
async function addSession(userId: string): Promise<string> {
  const token = `t_${newId()}`;
  await db()
    .insert(sessions)
    .values({ userId, token, expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

const sessionCount = async (userId: string): Promise<number> =>
  (await db().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId))).length;

describe("[P0-06] sessions rotate on privilege change (SECURITY §2)", () => {
  it("becoming staff ends the user's existing (customer) sessions on every device", async () => {
    const user = await makeUser({ password: null });
    await addSession(user.id);
    await addSession(user.id);
    const shop = await makeShop();

    await makeStaff(shop.id, user.id, "staff");

    expect(await sessionCount(user.id)).toBe(0);
  });

  it("a role change, deactivation or removal at a shop ends the user's sessions", async () => {
    const user = await makeUser();
    const shop = await makeShop();
    const row = await makeStaff(shop.id, user.id, "staff");

    await addSession(user.id);
    await db().update(shopStaff).set({ role: "owner" }).where(eq(shopStaff.id, row.id));
    expect(await sessionCount(user.id)).toBe(0);

    await addSession(user.id);
    await db().update(shopStaff).set({ active: false }).where(eq(shopStaff.id, row.id));
    expect(await sessionCount(user.id)).toBe(0);

    await addSession(user.id);
    await db().delete(shopStaff).where(eq(shopStaff.id, row.id));
    expect(await sessionCount(user.id)).toBe(0);
  });

  it("admin grant, role change, deactivation and removal end the user's sessions", async () => {
    const user = await makeUser();
    await addSession(user.id);
    await makeAdmin(user.id, "support");
    expect(await sessionCount(user.id)).toBe(0);

    await addSession(user.id);
    await db().update(adminMembers).set({ role: "owner" }).where(eq(adminMembers.userId, user.id));
    expect(await sessionCount(user.id)).toBe(0);

    await addSession(user.id);
    await db().update(adminMembers).set({ active: false }).where(eq(adminMembers.userId, user.id));
    expect(await sessionCount(user.id)).toBe(0);

    await addSession(user.id);
    await db().delete(adminMembers).where(eq(adminMembers.userId, user.id));
    expect(await sessionCount(user.id)).toBe(0);
  });

  it("edits that don't change privileges keep sessions, and other users are untouched", async () => {
    const user = await makeUser();
    const other = await makeUser();
    const shop = await makeShop();
    const row = await makeStaff(shop.id, user.id, "staff");
    await addSession(user.id);
    await addSession(other.id);

    await db().update(shopStaff).set({ perAwardLimit: 50 }).where(eq(shopStaff.id, row.id));
    await db().update(shopStaff).set({ role: "staff" }).where(eq(shopStaff.id, row.id)); // same value

    expect(await sessionCount(user.id)).toBe(1);
    expect(await sessionCount(other.id)).toBe(1);
  });
});

describe("[P0-06] email casing (SECURITY §2, audit SEC-M5b)", () => {
  it("the database refuses an email that is not stored in lower case", async () => {
    const insert = db()
      .insert(users)
      .values({ email: `Mixed.${newId()}@Test.moz.invalid`, name: "Casing" });
    await expect(insert).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("existing rows all satisfy the rule", async () => {
    const [row] = (await db().execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email <> lower(email)`,
    )) as unknown as { n: number }[];
    expect(row?.n).toBe(0);
  });
});

describe("[P0-19] the session-revocation trigger can't be redirected through search_path (SEC-9)", () => {
  it("clears public.sessions even when a hostile schema with its own `sessions` comes first", async () => {
    const user = await makeUser();
    const shop = await makeShop();
    await addSession(user.id);
    const schema = `evil_${String(process.pid)}`;
    try {
      const counts = await db().transaction(async (tx) => {
        await tx.execute(sql.raw(`CREATE SCHEMA ${schema}`));
        await tx.execute(sql.raw(`CREATE TABLE ${schema}.sessions (user_id uuid)`));
        await tx.execute(sql.raw(`INSERT INTO ${schema}.sessions VALUES ('${user.id}')`));
        await tx.execute(sql.raw(`SET LOCAL search_path = ${schema}, public`));
        await tx.execute(
          sql`INSERT INTO public.shop_staff (id, shop_id, user_id, role) VALUES (${newId()}, ${shop.id}, ${user.id}, 'staff')`,
        );
        const [real] = await tx.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM public.sessions WHERE user_id = ${user.id}`,
        );
        const [impostor] = await tx.execute<{ n: number }>(
          sql.raw(`SELECT count(*)::int AS n FROM ${schema}.sessions`),
        );
        return { real: real?.n, impostor: impostor?.n };
      });
      expect(counts).toEqual({ real: 0, impostor: 1 });
    } finally {
      await db().execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
    }
  });

  it("pins the function's search_path", async () => {
    const [row] = await db().execute<{ config: string[] | null }>(
      sql`SELECT proconfig AS config FROM pg_proc WHERE proname = 'revoke_sessions_on_privilege_change'`,
    );
    expect(row?.config).toEqual(["search_path=pg_catalog, public, pg_temp"]);
  });
});
