import { readdirSync, readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import {
  mintAdminScope,
  mintCustomerScope,
  mintShopScope,
  publicScope,
  type Scope,
  systemScope,
} from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import {
  accounts,
  auditLogs,
  customerProfiles,
  memberships,
  outbox,
  passkeys,
  sessions,
  shopStaff,
  twoFactors,
  verifications,
} from "@/server/db/schema";
import { replayOutbox, sweepOutbox } from "@/server/jobs/relay";
import { adminRead, transaction, withScope } from "@/server/repos/_base";
import {
  makeAdmin,
  makeCustomerProfile,
  makeMembership,
  makeShop,
  makeStaff,
  makeUser,
} from "@/server/testing/factories";
import { rlsState } from "../../scripts/check-migrations";

/**
 * P0-20 (SECURITY §3): Row-Level Security as the second wall. Every query here runs WITHOUT the app filter
 * (no `inShop`/`ownedBy`, no WHERE on the tenant column), as the real roles, so only RLS decides what is seen.
 */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

type Ids = Awaited<ReturnType<typeof buildWorld>>;
let w: Ids;

async function buildWorld() {
  const [shopA, shopB, shopPending] = await Promise.all([
    makeShop({ status: "active" }),
    makeShop({ status: "active" }),
    makeShop({ status: "pending" }),
  ]);
  const [ownerA, ownerB, custA, custB, admin] = await Promise.all([
    makeUser({ password: "x-not-used-x-not-used" }),
    makeUser({ password: "x-not-used-x-not-used" }),
    makeUser(),
    makeUser(),
    makeUser(),
  ]);
  await makeStaff(shopA.id, ownerA.id, "owner");
  await makeStaff(shopB.id, ownerB.id, "owner");
  await makeAdmin(admin.id, "owner");
  await makeMembership(custA.id, shopA.id);
  await makeMembership(custB.id, shopB.id);
  await makeMembership(custB.id, shopA.id);
  await makeCustomerProfile(custA.id);
  await makeCustomerProfile(custB.id);
  const future = new Date(Date.now() + 86_400_000);
  for (const u of [ownerA, custA, custB]) {
    await db()
      .insert(sessions)
      .values({ userId: u.id, token: `tok-${newId()}`, expiresAt: future });
  }
  for (const u of [custA, custB]) {
    await db()
      .insert(passkeys)
      .values({
        userId: u.id,
        publicKey: "pk",
        credentialID: `cred-${newId()}`,
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      });
  }
  for (const u of [ownerA, ownerB]) {
    await db().insert(twoFactors).values({ userId: u.id, secret: "s", backupCodes: "b" });
  }
  await db()
    .insert(verifications)
    .values({ identifier: "x@test.moz.invalid", value: "v", expiresAt: future });
  await db()
    .insert(auditLogs)
    .values([
      { actorRole: "system", action: "test.a", entity: "t" },
      { actorRole: "system", action: "test.b", entity: "t" },
    ]);
  await db()
    .insert(outbox)
    .values({ id: newId(), queue: "email", jobName: "staff-lockout", payload: { v: 1, data: {} } });
  return { shopA, shopB, shopPending, ownerA, ownerB, custA, custB, admin };
}

const scopes = () => ({
  shopA: mintShopScope({ userId: w.ownerA.id, shopId: w.shopA.id, role: "owner" }),
  custA: mintCustomerScope({ userId: w.custA.id }),
  admin: mintAdminScope({ userId: w.admin.id, role: "owner" }),
  pub: publicScope("test: what any visitor may see"),
});

/** Rows of `table` visible to `scope`, by the given column (no WHERE: RLS alone filters). `'x'` for any table. */
async function visible(scope: Scope, table: string, column = "id"): Promise<string[]> {
  const rows = await withScope(scope, (q) =>
    q.execute<{ v: string }>(sql.raw(`SELECT ${column}::text AS v FROM ${table} ORDER BY 1`)),
  );
  return [...rows].map((r) => r.v);
}

beforeAll(async () => {
  w = await buildWorld();
});

describe("[P0-20] catalog: every table has RLS enabled, forced and a policy, unless declared global", () => {
  it("matches the migrations' declarations on the live database", async () => {
    const files = readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(`drizzle/${name}`, "utf8") }));
    const globals = new Set(rlsState(files).global.keys());
    const tables = await db().execute<{
      name: string;
      rls: boolean;
      forced: boolean;
      policies: number;
    }>(sql`
      SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
               AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'spatial_ref_sys'`);
    expect(tables.length).toBeGreaterThan(15);
    for (const t of tables) {
      if (globals.has(t.name)) continue;
      expect({ name: t.name, rls: t.rls, forced: t.forced, hasPolicy: t.policies > 0 }).toEqual({
        name: t.name,
        rls: true,
        forced: true,
        hasPolicy: true,
      });
    }
  });

  it("role attributes: only moz_worker bypasses RLS; none is a superuser", async () => {
    const roles = await db().execute<{ name: string; bypass: boolean; superuser: boolean }>(sql`
      SELECT rolname AS name, rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles
      WHERE rolname IN ('moz_app', 'moz_auth', 'moz_worker') ORDER BY 1`);
    expect([...roles]).toEqual([
      { name: "moz_app", bypass: false, superuser: false },
      { name: "moz_auth", bypass: false, superuser: false },
      { name: "moz_worker", bypass: true, superuser: false },
    ]);
  });
});

describe("[P0-20] AC1: with the app filter removed, RLS alone blocks cross-shop reads", () => {
  it("shop scope sees only its own shop's members, team and identity rows", async () => {
    const { shopA } = scopes();
    expect(await visible(shopA, "memberships", "shop_id")).toEqual([w.shopA.id, w.shopA.id]);
    expect(await visible(shopA, "shop_staff", "shop_id")).toEqual([w.shopA.id]);
    expect(await visible(shopA, "users")).toEqual([w.ownerA.id]);
    expect(await visible(shopA, "sessions", "user_id")).toEqual([w.ownerA.id]);
    expect(await visible(shopA, "customer_profiles", "user_id")).toEqual([]);
    expect(await visible(shopA, "admin_members", "user_id")).toEqual([]);
    expect(await visible(shopA, "audit_logs")).toEqual([]);
    expect(await visible(shopA, "passkeys", "user_id")).toEqual([]);
  });

  it("customer scope sees only their own rows", async () => {
    const { custA } = scopes();
    expect(await visible(custA, "memberships", "user_id")).toEqual([w.custA.id]);
    expect(await visible(custA, "customer_profiles", "user_id")).toEqual([w.custA.id]);
    expect(await visible(custA, "users")).toEqual([w.custA.id]);
    expect(await visible(custA, "sessions", "user_id")).toEqual([w.custA.id]);
    expect(await visible(custA, "passkeys", "user_id")).toEqual([w.custA.id]);
    expect(await visible(custA, "shop_staff")).toEqual([]);
    expect(await visible(custA, "admin_members", "user_id")).toEqual([]);
    expect(await visible(custA, "audit_logs")).toEqual([]);
  });

  it("shops: the public directory never shows a pending shop; the team sees its own row", async () => {
    const { pub, shopA } = scopes();
    const listed = await visible(pub, "shops");
    expect(listed).toEqual(expect.arrayContaining([w.shopA.id, w.shopB.id]));
    expect(listed).not.toContain(w.shopPending.id);
    expect(await visible(pub, "users")).toEqual([]);
    expect(await visible(pub, "memberships")).toEqual([]);
    expect(await visible(shopA, "shops")).toContain(w.shopA.id);
  });

  it("the identity and system tables are not readable by the web role at all", async () => {
    const { custA, shopA } = scopes();
    for (const table of [
      "two_factors",
      "verifications",
      "outbox",
      "failed_jobs",
      "job_heartbeats",
    ]) {
      expect(await pgCode(() => visible(custA, table, "'x'")), table).toBe("42501");
      expect(await pgCode(() => visible(shopA, table, "'x'")), table).toBe("42501");
    }
  });

  it("a scope whose role no longer exists, or was never real, sees nothing (the DB checks the role)", async () => {
    const forged = mintShopScope({ userId: w.ownerA.id, shopId: w.shopB.id, role: "owner" });
    expect(await visible(forged, "memberships")).toEqual([]);
    // Not an admin in admin_members: no cross-shop rows, only what the user owns anyway.
    const fakeAdmin = mintAdminScope({ userId: w.custA.id, role: "owner" });
    expect(await visible(fakeAdmin, "memberships", "user_id")).toEqual([w.custA.id]);
    expect(await visible(fakeAdmin, "shops")).not.toContain(w.shopPending.id);
    const lone = await makeUser();
    const shop = await makeShop({ status: "active" });
    await makeStaff(shop.id, lone.id, "staff");
    const other = await makeUser();
    await makeMembership(other.id, shop.id);
    const scope = mintShopScope({ userId: lone.id, shopId: shop.id, role: "staff" });
    expect(await visible(scope, "memberships", "shop_id")).toEqual([shop.id]);
    await db().update(shopStaff).set({ active: false }).where(eq(shopStaff.userId, lone.id));
    expect(await visible(scope, "memberships")).toEqual([]);
  });

  it("admin scope (active admin) reads across shops; adminRead writes one audit row per read", async () => {
    const { admin } = scopes();
    const all = await visible(admin, "memberships", "shop_id");
    expect(all).toEqual(expect.arrayContaining([w.shopA.id, w.shopB.id]));
    expect(await visible(admin, "shops")).toContain(w.shopPending.id);
    const before = await db().select().from(auditLogs).where(eq(auditLogs.action, "admin.read"));
    const rows = await adminRead(
      admin,
      { entity: "memberships", reason: "test: support lookup" },
      (tx) => tx.select().from(memberships),
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const after = await db().select().from(auditLogs).where(eq(auditLogs.action, "admin.read"));
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)).toMatchObject({ actorId: w.admin.id, entity: "memberships" });
  });
});

describe("[P0-20] AC1: with the app filter removed, RLS alone blocks cross-shop writes", () => {
  it("shop scope: an unfiltered UPDATE touches only its own shop; inserting into another shop fails", async () => {
    const { shopA } = scopes();
    const updated = await withScope(shopA, (q) =>
      q.update(memberships).set({ muted: true }).returning({ shopId: memberships.shopId }),
    );
    expect(updated.map((r) => r.shopId)).toEqual([w.shopA.id, w.shopA.id]);
    const [bRow] = await db().select().from(memberships).where(eq(memberships.shopId, w.shopB.id));
    expect(bRow?.muted).toBe(false);

    const renamed = await withScope(shopA, (q) =>
      q.execute(sql`UPDATE shops SET description = 'rls probe' RETURNING id`),
    );
    expect([...renamed].map((r) => (r as { id: string }).id)).toEqual([w.shopA.id]);

    const intruder = await makeUser();
    expect(
      await pgCode(() =>
        withScope(shopA, (q) =>
          q.insert(shopStaff).values({ shopId: w.shopB.id, userId: intruder.id, role: "owner" }),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(shopA, (q) =>
          q.insert(memberships).values({ userId: intruder.id, shopId: w.shopB.id }),
        ),
      ),
    ).toBe("42501");
  });

  it("customer scope: unfiltered UPDATE/DELETE touch only their own rows; inserting for another user fails", async () => {
    const { custA } = scopes();
    const renamed = await withScope(custA, (q) =>
      q
        .update(customerProfiles)
        .set({ fullName: "RLS Probe" })
        .returning({ id: customerProfiles.userId }),
    );
    expect(renamed.map((r) => r.id)).toEqual([w.custA.id]);
    const ended = await withScope(custA, (q) =>
      q.delete(sessions).returning({ id: sessions.userId }),
    );
    expect(ended.map((r) => r.id)).toEqual([w.custA.id]);
    expect(await db().select().from(sessions).where(eq(sessions.userId, w.custB.id))).toHaveLength(
      1,
    );
    expect(
      await pgCode(() =>
        withScope(custA, (q) =>
          q.insert(memberships).values({ userId: w.custB.id, shopId: w.shopPending.id }),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(custA, (q) =>
          q.update(accounts).set({ scope: "x" }).returning({ id: accounts.id }),
        ),
      ),
    ).toBe("42501");
  });
});

describe("[P0-20] AC2a and AC4: raw SQL as each role", () => {
  const appUrl = (): string => process.env.DATABASE_URL ?? "";
  const run = async <T>(url: string, fn: (s: postgres.Sql) => Promise<T>): Promise<T> => {
    const client = postgres(url, { max: 1, onnotice: () => {} });
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  };
  const asShopA = (s: postgres.TransactionSql) =>
    s`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${w.ownerA.id}, true),
             set_config('app.shop_id', ${w.shopA.id}, true)`;

  it("the web role cannot read another shop's rows even with raw SQL; with no settings it reads nothing", async () => {
    const shops = await run(appUrl(), (s) =>
      s.begin(async (tx) => {
        await asShopA(tx);
        return tx<{ shop_id: string }[]>`SELECT DISTINCT shop_id::text FROM memberships`;
      }),
    );
    expect(shops.map((r) => r.shop_id)).toEqual([w.shopA.id]);
    const none = await run(
      appUrl(),
      (s) => s<{ n: number }[]>`SELECT count(*)::int AS n FROM memberships`,
    );
    expect(none[0]?.n).toBe(0);
  });

  it("the worker role reads every shop's rows (BYPASSRLS)", async () => {
    const shops = await run(
      process.env.DATABASE_URL_WORKER ?? "",
      (s) => s<{ shop_id: string }[]>`SELECT DISTINCT shop_id::text FROM memberships ORDER BY 1`,
    );
    expect(shops.map((r) => r.shop_id)).toEqual(expect.arrayContaining([w.shopA.id, w.shopB.id]));
  });

  it("FORCE: the table owner (not a superuser) is filtered too; without FORCE it would see everything", async () => {
    const probe = `moz_owner_probe_${String(process.pid)}`;
    const seen: { forced?: string[]; unforced?: number | undefined } = {};
    // Everything below is rolled back: the probe role, the ownership change and NO FORCE.
    const code = await pgCode(() =>
      db().transaction(async (tx) => {
        await tx.execute(
          sql.raw(`CREATE ROLE ${probe} NOLOGIN NOSUPERUSER NOBYPASSRLS IN ROLE moz_app`),
        );
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${probe}`));
        await tx.execute(sql.raw(`ALTER TABLE memberships OWNER TO ${probe}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${probe}`));
        await tx.execute(
          sql`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${w.ownerA.id}, true), set_config('app.shop_id', ${w.shopA.id}, true)`,
        );
        const forced = await tx.execute<{ shop_id: string }>(
          sql`SELECT DISTINCT shop_id::text FROM memberships`,
        );
        seen.forced = [...forced].map((r) => r.shop_id);
        await tx.execute(sql`ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY`);
        const unforced = await tx.execute<{ n: number }>(
          sql`SELECT count(DISTINCT shop_id)::int AS n FROM memberships`,
        );
        seen.unforced = [...unforced][0]?.n;
        throw Object.assign(new Error("rollback"), { code: "ROLLBACK_OK" });
      }),
    );
    expect(code).toBe("ROLLBACK_OK");
    expect(seen.forced).toEqual([w.shopA.id]);
    expect(seen.unforced).toBeGreaterThanOrEqual(2);
    const [still] = await db().execute<{ forced: boolean }>(
      sql`SELECT relforcerowsecurity AS forced FROM pg_class WHERE relname = 'memberships'`,
    );
    expect(still?.forced).toBe(true);
  });
});

describe("[P0-20] edge cases: settings are transaction-local and a transaction keeps its scope", () => {
  it("a pooled connection never carries the previous transaction's tenant (SET LOCAL only)", async () => {
    const client = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
    try {
      const inside = await client.begin(async (tx) => {
        await tx`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${w.ownerA.id}, true), set_config('app.shop_id', ${w.shopA.id}, true)`;
        return tx<{ n: number }[]>`SELECT count(*)::int AS n FROM memberships`;
      });
      expect(inside[0]?.n).toBe(2);
      // Same single connection, next statement outside that transaction: nothing set, nothing visible.
      const [after] = await client<{ shop: string | null; n: number }[]>`
        SELECT app_shop_id()::text AS shop, (SELECT count(*)::int FROM memberships) AS n`;
      expect(after).toEqual({ shop: null, n: 0 });
    } finally {
      await client.end();
    }
  });

  it("the helper's pool: one scope's settings are gone in the next call under another scope", async () => {
    const { shopA, custA } = scopes();
    for (let i = 0; i < 5; i++) {
      expect(await visible(shopA, "memberships", "shop_id")).toEqual([w.shopA.id, w.shopA.id]);
      expect(await visible(custA, "memberships", "user_id")).toEqual([w.custA.id]);
    }
  });

  it("refuses to run a repository call under one scope inside a transaction opened for another", async () => {
    const { shopA, custA } = scopes();
    await expect(
      transaction(shopA, (tx) => withScope(custA, (q) => q.select().from(memberships), tx)),
    ).rejects.toThrow(/opened for shop scope reused for another scope/);
    await expect(
      withScope(custA, (q) => q.select().from(memberships), {} as never),
    ).rejects.toThrow(/not opened by transaction\(\)/);
  });
});

describe("[P0-20] review fixes: role-bound writes and narrow identity grants", () => {
  it("a staff member can't change their shop's team; a non-owner admin can't change the admin team", async () => {
    const shop = await makeShop({ status: "active" });
    const staffUser = await makeUser();
    await makeStaff(shop.id, staffUser.id, "staff");
    const staff = mintShopScope({ userId: staffUser.id, shopId: shop.id, role: "staff" });
    const promoted = await withScope(staff, (q) =>
      q.update(shopStaff).set({ role: "owner" }).returning({ id: shopStaff.id }),
    );
    expect(promoted).toEqual([]);
    const mod = await makeUser();
    await makeAdmin(mod.id, "moderator");
    const modScope = mintAdminScope({ userId: mod.id, role: "moderator" });
    expect(
      await pgCode(() =>
        withScope(modScope, (q) =>
          q.execute(sql`INSERT INTO admin_members (user_id, role) VALUES (${w.custA.id}, 'owner')`),
        ),
      ),
    ).toBe("42501");
  });

  it("the web role can't read session tokens or account rows, nor change its own email", async () => {
    const { custA } = scopes();
    expect(await pgCode(() => visible(custA, "sessions", "token"))).toBe("42501");
    expect(await pgCode(() => visible(custA, "accounts", "'x'"))).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(custA, (q) => q.execute(sql`UPDATE users SET email = 'x@test.moz.invalid'`)),
      ),
    ).toBe("42501");
  });

  it("audit rows can't name another actor; an outbox row can't claim a higher role", async () => {
    const { custA } = scopes();
    expect(
      await pgCode(() =>
        withScope(custA, (q) =>
          q
            .insert(auditLogs)
            .values({ actorId: w.custB.id, actorRole: "customer", action: "x", entity: "x" }),
        ),
      ),
    ).toBe("42501");
    const shop = await makeShop({ status: "active" });
    const u = await makeUser();
    await makeStaff(shop.id, u.id, "staff");
    const staff = mintShopScope({ userId: u.id, shopId: shop.id, role: "staff" });
    const row = (role: string) => ({
      id: newId(),
      queue: "email",
      jobName: "tenant-probe",
      payload: { v: 1, data: {} },
      scopeKind: "shop",
      scopeUserId: u.id,
      scopeShopId: shop.id,
      scopeRole: role,
    });
    await withScope(staff, (q) => q.insert(outbox).values(row("staff")));
    expect(await pgCode(() => withScope(staff, (q) => q.insert(outbox).values(row("owner"))))).toBe(
      "42501",
    );
  });

  it("feature flags: readable publicly, writable only by an active admin", async () => {
    const { pub, custA } = scopes();
    expect(
      await pgCode(() =>
        withScope(pub, (q) =>
          q.execute(sql`INSERT INTO feature_flags (key, enabled) VALUES ('rls_probe', true)`),
        ),
      ),
    ).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(custA, (q) =>
          q.execute(sql`UPDATE feature_flags SET enabled = true RETURNING key`),
        ),
      ),
    ).toBeUndefined();
    const flags = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM feature_flags WHERE enabled`,
    );
    expect([...flags][0]?.n ?? 0).toBe(0);
  });
});

describe("[P0-20] re-review (0011): admin writes bound to the admin role; definer helpers locked", () => {
  const ADMIN_ROLES = ["owner", "support", "moderator", "finance"] as const;
  async function adminScopeOf(role: (typeof ADMIN_ROLES)[number]): Promise<Scope> {
    const u = await makeUser();
    await makeAdmin(u.id, role);
    return mintAdminScope({ userId: u.id, role });
  }

  it("shop teams and shops: only admin owner/support write; every admin role still reads", async () => {
    for (const role of ADMIN_ROLES) {
      const scope = await adminScopeOf(role);
      const writer = role === "owner" || role === "support";
      const target = await makeUser();
      const shop = await makeShop({ status: "active" });
      const insert = await pgCode(() =>
        withScope(scope, (q) =>
          q.execute(
            sql`INSERT INTO shop_staff (id, user_id, shop_id, role) VALUES (${newId()}, ${target.id}, ${shop.id}, 'owner')`,
          ),
        ),
      );
      expect(insert, `${role} insert shop_staff`).toBe(writer ? undefined : "42501");
      const renamed = await withScope(scope, (q) =>
        q.execute<{ id: string }>(
          sql`UPDATE shops SET name = 'renamed' WHERE id = ${shop.id} RETURNING id`,
        ),
      );
      expect([...renamed].length, `${role} update shops`).toBe(writer ? 1 : 0);
      expect(await visible(scope, "shops"), `${role} reads shops`).toContain(shop.id);
      expect(await visible(scope, "shop_staff", "shop_id"), `${role} reads teams`).toContain(
        w.shopA.id,
      );
    }
  });

  it("feature flags: admin owner only; content settings: admin owner and moderator", async () => {
    for (const role of ADMIN_ROLES) {
      const scope = await adminScopeOf(role);
      const flag = await pgCode(() =>
        withScope(scope, (q) =>
          q.execute(
            sql`INSERT INTO feature_flags (key, enabled) VALUES (${`probe_${role}_${newId().slice(0, 8)}`}, false)`,
          ),
        ),
      );
      expect(flag, `${role} flag`).toBe(role === "owner" ? undefined : "42501");
      const setting = await pgCode(() =>
        withScope(scope, (q) =>
          q.execute(
            sql`INSERT INTO content_settings (key, value) VALUES (${`probe_${role}_${newId().slice(0, 8)}`}, '{}'::jsonb)`,
          ),
        ),
      );
      expect(setting, `${role} content setting`).toBe(
        role === "owner" || role === "moderator" ? undefined : "42501",
      );
    }
  });

  it("every SECURITY DEFINER function: NOLOGIN owner, pinned search_path, no PUBLIC EXECUTE", async () => {
    const fns = await db().execute<{
      name: string;
      canLogin: boolean;
      config: string[] | null;
      publicExec: boolean;
    }>(sql`
      SELECT p.proname AS name, r.rolcanlogin AS "canLogin", p.proconfig AS config,
             has_function_privilege('public', p.oid, 'EXECUTE')
               OR p.proacl IS NULL
               OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS "publicExec"
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
      WHERE n.nspname = 'public' AND p.prosecdef ORDER BY 1`);
    expect([...fns].map((f) => f.name)).toEqual([
      "app_admin_role",
      "app_in_shop",
      "app_is_admin",
      "app_shop_role",
      "revoke_sessions_on_privilege_change",
    ]);
    for (const f of fns) {
      expect(f.canLogin, `${f.name} owner can log in`).toBe(false);
      expect(f.config ?? [], `${f.name} search_path`).toContain(
        "search_path=pg_catalog, public, pg_temp",
      );
      expect(f.publicExec, `${f.name} PUBLIC EXECUTE`).toBe(false);
    }
  });

  it("an outbox row of a shop/admin scope must carry its role (no NULL role)", async () => {
    const shop = await makeShop({ status: "active" });
    const u = await makeUser();
    await makeStaff(shop.id, u.id, "staff");
    // A shop scope whose user is not actually on the team: app_shop_role() is NULL.
    const outsider = await makeUser();
    const fake = mintShopScope({ userId: outsider.id, shopId: shop.id, role: "staff" });
    expect(
      await pgCode(() =>
        withScope(fake, (q) =>
          q.insert(outbox).values({
            id: newId(),
            queue: "email",
            jobName: "tenant-probe",
            payload: { v: 1, data: {} },
            scopeKind: "shop",
            scopeUserId: outsider.id,
            scopeShopId: shop.id,
            scopeRole: null,
          }),
        ),
      ),
    ).toBe("42501");
  });
});

describe("[P0-20] C-29: the web role may only append to the outbox", () => {
  it("cannot read, complete or delete an outbox row", async () => {
    const { custA, shopA } = scopes();
    expect(await pgCode(() => withScope(custA, (q) => q.select().from(outbox)))).toBe("42501");
    expect(
      await pgCode(() =>
        withScope(shopA, (q) => q.update(outbox).set({ completedAt: new Date() })),
      ),
    ).toBe("42501");
    expect(await pgCode(() => withScope(shopA, (q) => q.delete(outbox)))).toBe("42501");
  });

  it("can append a row only with its own real scope (C-30: a forged origin is refused)", async () => {
    const { custA } = scopes();
    const base = { queue: "email", jobName: "tenant-probe", payload: { v: 1, data: {} } };
    const own = {
      scopeKind: "customer",
      scopeUserId: w.custA.id,
      scopeShopId: null,
      scopeRole: null,
    };
    await withScope(custA, (q) => q.insert(outbox).values({ id: newId(), ...base, ...own }));
    for (const forged of [
      { ...own, scopeUserId: w.custB.id },
      { ...own, scopeKind: "shop", scopeShopId: w.shopA.id },
      { ...own, scopeKind: "system", scopeUserId: null },
    ]) {
      expect(
        await pgCode(() =>
          withScope(custA, (q) => q.insert(outbox).values({ id: newId(), ...base, ...forged })),
        ),
        JSON.stringify(forged),
      ).toBe("42501");
    }
  });
});

describe("[P0-20] AC4: cross-shop sweeps run as moz_worker and are audit-logged", () => {
  const sweepAudits = () =>
    db().select().from(auditLogs).where(eq(auditLogs.action, "system.sweep"));

  it("a sweep that changed rows writes one audit row; an empty sweep writes none", async () => {
    await db().delete(outbox);
    const before = (await sweepAudits()).length;
    await sweepOutbox({ dispatch: async () => undefined });
    expect(await sweepAudits()).toHaveLength(before);
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db()
      .insert(outbox)
      .values({
        id: newId(),
        queue: "email",
        jobName: "staff-lockout",
        payload: { v: 1, data: {} },
        createdAt: old,
        dispatchedAt: old,
        completedAt: old,
      });
    const res = await sweepOutbox({ dispatch: async () => undefined });
    expect(res.pruned).toBe(1);
    const rows = await sweepAudits();
    expect(rows).toHaveLength(before + 1);
    expect(rows.at(-1)).toMatchObject({
      actorId: null,
      actorRole: "system",
      entity: "outbox",
      meta: { job: "outbox-sweep", pruned: 1, redispatched: 0, stale: 0 },
    });
  });

  it("every replay run is audited, dry runs too", async () => {
    await replayOutbox(new Date(Date.now() - 60_000), { dryRun: true });
    const [row] = await db()
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "system.replay"))
      .orderBy(sql`${auditLogs.at} DESC`)
      .limit(1);
    expect(row).toMatchObject({ actorRole: "system", meta: { dryRun: true, replayed: 0 } });
  });

  it("systemScope is the worker role: it sees every tenant's rows", async () => {
    const all = await withScope(systemScope("test: cross-shop sweep probe"), (q) =>
      q.select({ shopId: memberships.shopId }).from(memberships),
    );
    expect(all.map((r) => r.shopId)).toEqual(expect.arrayContaining([w.shopA.id, w.shopB.id]));
  });
});
