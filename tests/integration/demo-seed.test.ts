import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth/auth";
import { dbAs, testOwnerDb as db } from "@/server/db/client";
import {
  DEMO_ACCOUNTS,
  DEMO_SHOPS,
  type DemoSeedConfig,
  demoCredentials,
  privilegedWithoutTotp,
  resetDemo,
  runDemoSeed,
  totpCode,
} from "@/server/db/demo-seed";
import { sessions, shops, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { purposeKey } from "@/server/security/keys";
import { cookieHeaderFrom } from "../fixtures/auth";
import { makeShop, makeStaff, makeUser } from "../fixtures/factories";

const ORIGIN = "http://localhost:3000";
const EMAIL_BASE = "demo@mozrewards.test";
const cfg = (): DemoSeedConfig => ({
  key: purposeKey("demo-seed"),
  emailBase: EMAIL_BASE,
  authSecret: env().AUTH_SECRET,
});
/** The seed runs as moz_worker (SECURITY §3), exactly like `pnpm db:seed`. */
const seed = () => runDemoSeed(dbAs("system"), cfg());
const creds = () => demoCredentials(purposeKey("demo-seed"), EMAIL_BASE);
const cred = (key: string) => {
  const found = creds().find((c) => c.key === key);
  if (!found) throw new Error(`no demo account ${key}`);
  return found;
};

const TABLES = [
  "users",
  "accounts",
  "two_factors",
  "customer_profiles",
  "shops",
  "shop_staff",
  "admin_members",
  "memberships",
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) {
    const [row] = (await db().execute(
      sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
    )) as unknown as { n: number }[];
    out[table] = row?.n ?? -1;
  }
  return out;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  getAuth().handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
/** A session cookie with a value (the two-factor challenge clears the cookie: `session_token=; Max-Age=0`). */
const hasSession = (res: Response): boolean =>
  res.headers.getSetCookie().some((c) => /session_token=[^;]/.test(c) && !/max-age=0/i.test(c));

describe("[P0-16] demo seed is idempotent and consistent", () => {
  it("creates the three shops and one account per role; a second run inserts nothing and counts stay identical", async () => {
    await resetDemo(dbAs("system"));
    const first = await seed();
    expect(first).toEqual({
      users: 7,
      shops: 3,
      staff: 2,
      admins: 4,
      memberships: 3,
    });
    const after1 = await counts();
    expect(after1).toMatchObject({
      users: 7,
      accounts: 6,
      two_factors: 6,
      customer_profiles: 1,
      shops: 3,
      shop_staff: 2,
      admin_members: 4,
      memberships: 3,
    });
    expect(await seed()).toEqual({ users: 0, shops: 0, staff: 0, admins: 0, memberships: 0 });
    expect(await counts()).toEqual(after1);
  });

  it("a re-run keeps what someone changed (shop name), --reset restores it with the same ids and codes", async () => {
    await seed();
    const brew = DEMO_SHOPS[0];
    await db().update(shops).set({ name: "Renamed by a demo" }).where(eq(shops.id, brew.id));
    await seed();
    const [kept] = await db().select().from(shops).where(eq(shops.id, brew.id));
    expect(kept?.name).toBe("Renamed by a demo");

    const before = await counts();
    await resetDemo(dbAs("system"));
    await seed();
    expect(await counts()).toEqual(before);
    const [restored] = await db().select().from(shops).where(eq(shops.id, brew.id));
    expect(restored).toMatchObject({ name: brew.name, shopCode: brew.shopCode, status: "active" });
    expect(restored?.location?.lat).toBeCloseTo(brew.location.lat, 4);
  });

  it("--reset removes only demo rows: other shops, users and their sessions survive", async () => {
    await seed();
    const other = await makeUser();
    const otherShop = await makeShop();
    const removed = await resetDemo(dbAs("system"));
    expect(removed).toEqual({ users: 7, shops: 3 });
    expect(await db().select().from(users).where(eq(users.id, other.id))).toHaveLength(1);
    expect(await db().select().from(shops).where(eq(shops.id, otherShop.id))).toHaveLength(1);
    expect(
      await db()
        .select()
        .from(users)
        .where(
          inArray(
            users.id,
            DEMO_ACCOUNTS.map((a) => a.id),
          ),
        ),
    ).toHaveLength(0);
    await seed();
  });

  it("a demo email already used by a different account stops the seed loudly, changing nothing", async () => {
    await resetDemo(dbAs("system"));
    const clash = await makeUser({ email: cred("owner").email });
    const before = await counts();
    await expect(seed()).rejects.toThrow();
    expect(await counts()).toEqual(before);
    await db().delete(users).where(eq(users.id, clash.id));
    await seed();
  });
});

describe("[P0-16] demo staff and admins are pre-enrolled with TOTP (C-07, audit SEC-2)", () => {
  it("every seeded staff/admin account has two-step verification on; the check finds an account without it", async () => {
    await seed();
    expect(await privilegedWithoutTotp(dbAs("system"))).toEqual([]);
    const bare = await makeUser();
    await makeStaff(DEMO_SHOPS[0].id, bare.id, "staff");
    expect(await privilegedWithoutTotp(dbAs("system"))).toEqual([bare.email]);
    await db().delete(users).where(eq(users.id, bare.id));
  });

  it.each(["staff", "owner", "admin-owner", "admin-support", "admin-moderator", "admin-finance"])(
    "%s: the password alone gives no session and cannot enrol or replace the authenticator",
    async (key) => {
      await seed();
      const { email, password } = cred(key);
      const challenge = await post("/sign-in/email", { email, password });
      expect(challenge.status).toBe(200);
      expect(
        ((await challenge.clone().json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect,
      ).toBe(true);
      expect(hasSession(challenge), challenge.headers.getSetCookie().join(" | ")).toBe(false);
      const cookie = cookieHeaderFrom(challenge).get("cookie") ?? "";
      const enrol = await post("/two-factor/enable", { password }, { cookie });
      expect(enrol.status).toBe(401);
      const [user] = await db().select().from(users).where(eq(users.email, email));
      expect(user?.twoFactorEnabled).toBe(true);
      expect(
        await db()
          .select()
          .from(sessions)
          .where(eq(sessions.userId, user?.id ?? "")),
      ).toEqual([]);
    },
  );

  it("the derived password + the derived TOTP code sign the owner in with an MFA-verified session", async () => {
    await seed();
    const { email, password, totpSecret } = cred("owner");
    const challenge = await post("/sign-in/email", { email, password });
    const cookie = cookieHeaderFrom(challenge).get("cookie") ?? "";
    const verified = await post(
      "/two-factor/verify-totp",
      { code: totpCode(totpSecret ?? "") },
      { cookie },
    );
    expect(verified.status).toBe(200);
    expect(hasSession(verified)).toBe(true);
    const [user] = await db().select().from(users).where(eq(users.email, email));
    const rows = await db()
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user?.id ?? ""));
    expect(rows.map((r) => r.mfaVerified)).toEqual([true]);
  });

  it("a wrong password is refused, and the customer account has no password to try", async () => {
    await seed();
    const wrong = await post("/sign-in/email", {
      email: cred("owner").email,
      password: "not-the-demo-password",
    });
    expect(wrong.status).toBe(401);
    const customer = await post("/sign-in/email", {
      email: cred("customer").email,
      password: "any-password-at-all",
    });
    expect(customer.status).toBe(401);
    expect(hasSession(customer)).toBe(false);
  });
});
