import { eq, type SQL, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { newId } from "@/lib/id";
import { testOwnerDb as db } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { auditLogs, contentSettings, shops, users } from "@/server/db/schema";
import { runSeed } from "@/server/db/seed";
import { makeMembership, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/** Postgres error code from a Drizzle-wrapped driver error. */
async function pgCode(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db().execute(query)) as unknown as T[];
}

describe("[P0-03] migrations", () => {
  it("re-running the migrations on a migrated database is a no-op", async () => {
    const count = sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`;
    const [before] = await rows<{ n: number }>(count);
    await runMigrations(process.env.DATABASE_URL_MIGRATIONS ?? "");
    const [after] = await rows<{ n: number }>(count);
    expect(after?.n).toBe(before?.n);
    expect(after?.n).toBeGreaterThanOrEqual(4);
  });
});

describe("[P0-03] updated_at trigger", () => {
  it("is attached to every table that has an updated_at column", async () => {
    const missing = await rows<{ table_name: string }>(sql`
      SELECT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND t.table_type = 'BASE TABLE'
        AND NOT EXISTS (
          SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
          WHERE tg.tgrelid = format('%I', c.table_name)::regclass AND p.proname = 'set_updated_at'
        )`);
    expect(missing.map((m) => m.table_name)).toEqual([]);
  });

  it("moves updated_at forward on a raw SQL update that does not set it", async () => {
    const shop = await makeShop();
    await db().execute(sql`ALTER TABLE shops DISABLE TRIGGER shops_set_updated_at`);
    await db().execute(
      sql`UPDATE shops SET updated_at = now() - interval '1 day' WHERE id = ${shop.id}`,
    );
    await db().execute(sql`ALTER TABLE shops ENABLE TRIGGER shops_set_updated_at`);
    await db().execute(sql`UPDATE shops SET name = 'Renamed' WHERE id = ${shop.id}`);
    const [row] = await db()
      .select({ updatedAt: shops.updatedAt })
      .from(shops)
      .where(eq(shops.id, shop.id));
    expect(Date.now() - (row?.updatedAt.getTime() ?? 0)).toBeLessThan(60_000);
  });
});

describe("[P0-03] append-only tables", () => {
  it("every reject_mutation table blocks row changes and TRUNCATE", async () => {
    const tables = await rows<{ rel: string; truncate: boolean[] }>(sql`
      SELECT tg.tgrelid::regclass::text AS rel, array_agg((tg.tgtype & 32) = 32) AS truncate
      FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE p.proname = 'reject_mutation' GROUP BY 1`);
    expect(tables.map((t) => t.rel)).toContain("audit_logs");
    for (const t of tables) expect(new Set(t.truncate)).toEqual(new Set([true, false]));
  });

  it("rejects TRUNCATE on audit_logs at the database level", async () => {
    await db()
      .insert(auditLogs)
      .values({ actorRole: "system", action: "test.truncate", entity: "test" });
    expect(await pgCode(() => db().execute(sql`TRUNCATE audit_logs`))).toBe("23001");
  });
});

describe("[P0-03] app role moz_app (least privilege)", () => {
  /**
   * P0-20: moz_app's exact grants per table (RLS policies then filter rows). Every table is listed, so a new
   * table makes this fail until its grants are decided. I/S/U/D = INSERT/SELECT/UPDATE/DELETE.
   */
  const MOZ_APP_GRANTS: Record<string, string> = {
    users: "S", // own row; UPDATE (name, image) by column grant; created and deleted by the identity layer / erasure job
    sessions: "D", // own devices (SELECT by column grant, never the token), sign out
    passkeys: "SD",
    accounts: "", // password hashes and OAuth tokens: identity layer only
    verifications: "",
    two_factors: "",
    customer_profiles: "ISUD",
    shops: "ISU", // no DELETE: shops close by status
    shop_staff: "ISUD",
    admin_members: "ISUD",
    memberships: "ISU", // no DELETE: a member leaves (left_at)
    audit_logs: "IS", // append-only
    feature_flags: "ISUD",
    content_settings: "ISUD",
    outbox: "I", // C-29: INSERT only
    failed_jobs: "",
    job_heartbeats: "",
    ops_snapshot: "S", // P0-13: admin owner reads the health snapshot (RLS); the worker writes it
    shop_hours: "ISUD", // P1-01: the owner edits hours (RLS: owner / admin owner+support)
    shop_closures: "ISUD", // P1-01: the owner adds and removes closure days (same RLS)
    nfc_tags: "ISU", // P1-01: no DELETE, tags are history (replaced, never removed)
  };

  it("has exactly the reviewed grants per table, never TRUNCATE", async () => {
    type Priv = {
      rel: string;
      ins: boolean;
      sel: boolean;
      upd: boolean;
      del: boolean;
      trunc: boolean;
    };
    const privs = await rows<Priv>(sql`
      SELECT c.relname AS rel,
        has_table_privilege('moz_app', c.oid, 'INSERT') AS ins,
        has_table_privilege('moz_app', c.oid, 'SELECT') AS sel,
        has_table_privilege('moz_app', c.oid, 'UPDATE') AS upd,
        has_table_privilege('moz_app', c.oid, 'DELETE') AS del,
        has_table_privilege('moz_app', c.oid, 'TRUNCATE') AS trunc
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'spatial_ref_sys'`);
    const actual = Object.fromEntries(
      privs.map((p) => [
        p.rel,
        `${p.ins ? "I" : ""}${p.sel ? "S" : ""}${p.upd ? "U" : ""}${p.del ? "D" : ""}${p.trunc ? "T" : ""}`,
      ]),
    );
    expect(actual).toEqual(MOZ_APP_GRANTS);
  });

  it("cannot rewrite audit history even before the trigger fires (permission denied)", async () => {
    const code = await pgCode(() =>
      db().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE moz_app`);
        await tx.execute(sql`UPDATE audit_logs SET action = 'tampered'`);
      }),
    );
    expect(code).toBe("42501");
  });

  it("appends audit rows under a scope; global config writes need an admin (P0-20)", async () => {
    await db().transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE moz_app`);
      await tx.execute(sql`SELECT set_config('app.scope', 'public', true)`);
      await tx.execute(
        sql`INSERT INTO audit_logs (id, actor_role, action, entity) VALUES (${newId()}, 'system', 'test.role', 'test')`,
      );
    });
    const code = await pgCode(() =>
      db().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL ROLE moz_app`);
        await tx.execute(
          sql`INSERT INTO content_settings (key, value) VALUES ('role_probe', '[]'::jsonb)`,
        );
      }),
    );
    expect(code).toBe("42501");
  });

  it("gets DML on tables created by later migrations automatically (default privileges)", async () => {
    let granted: boolean | undefined;
    const code = await pgCode(() =>
      db().transaction(async (tx) => {
        await tx.execute(sql`CREATE TABLE zz_future_table (id int)`);
        const [p] = (await tx.execute(
          sql`SELECT has_table_privilege('moz_app', 'zz_future_table', 'INSERT') AS ins`,
        )) as unknown as { ins: boolean }[];
        granted = p?.ins;
        throw Object.assign(new Error("rollback"), { code: "ROLLBACK_OK" });
      }),
    );
    expect(code).toBe("ROLLBACK_OK");
    expect(granted).toBe(true);
  });
});

describe("[P0-03] constraints in the database", () => {
  it("one membership per user and shop", async () => {
    const [user, shop] = await Promise.all([makeUser(), makeShop()]);
    await makeMembership(user.id, shop.id);
    expect(await pgCode(() => makeMembership(user.id, shop.id))).toBe("23505");
  });

  it("one staff row per user and shop", async () => {
    const [user, shop] = await Promise.all([makeUser(), makeShop()]);
    await makeStaff(shop.id, user.id);
    expect(await pgCode(() => makeStaff(shop.id, user.id, "owner"))).toBe("23505");
  });

  it("emails are unique regardless of case", async () => {
    const u = await makeUser();
    expect(await pgCode(() => makeUser({ email: u.email.toUpperCase() }))).toBe("23505");
  });

  it("shop codes are unique and must use the code alphabet", async () => {
    const shop = await makeShop();
    // Direct insert: makeShop itself retries collisions with a fresh code (withUniqueCode).
    const dup = { slug: `dup-${newId()}`, shopCode: shop.shopCode, name: "Dup", category: "cafe" };
    expect(await pgCode(() => db().insert(shops).values(dup))).toBe("23505");
    expect(await pgCode(() => makeShop({ shopCode: "ABC0O1" }))).toBe("23514");
  });

  it("content setting keys follow the key format", async () => {
    expect(
      await pgCode(() => db().insert(contentSettings).values({ key: "Bad Key!", value: [] })),
    ).toBe("23514");
  });

  it("two_factor_enabled cannot be NULL", async () => {
    const u = await makeUser();
    expect(
      await pgCode(() =>
        db().execute(sql`UPDATE users SET two_factor_enabled = NULL WHERE id = ${u.id}`),
      ),
    ).toBe("23502");
    const [row] = await db().select({ id: users.id }).from(users).where(eq(users.id, u.id));
    expect(row?.id).toBe(u.id);
  });
});

describe("[P0-03] geography locations", () => {
  it("round-trips { lng, lat } and measures distance in metres", async () => {
    const camden = await makeShop({ location: { lng: -0.1426, lat: 51.539 } });
    const leicester = await makeShop({ location: { lng: -1.1332, lat: 52.6369 } });
    const [row] = await db()
      .select({ location: shops.location })
      .from(shops)
      .where(eq(shops.id, camden.id));
    expect(row?.location?.lng).toBeCloseTo(-0.1426, 6);
    expect(row?.location?.lat).toBeCloseTo(51.539, 6);
    const [d] = await rows<{ m: number }>(sql`
      SELECT ST_Distance(a.location, b.location)::float8 AS m FROM shops a, shops b
      WHERE a.id = ${camden.id} AND b.id = ${leicester.id}`);
    // Camden → Leicester is roughly 141 km as the crow flies.
    expect(d?.m).toBeGreaterThan(135_000);
    expect(d?.m).toBeLessThan(147_000);
  });
});

describe("[P0-03] seed", () => {
  it("is idempotent: a second run inserts nothing and keeps admin changes", async () => {
    await runSeed(db());
    await db()
      .update(contentSettings)
      .set({ value: ["Edited"] })
      .where(eq(contentSettings.key, "marketplace_categories"));
    expect(await runSeed(db())).toEqual({ flags: 0, content: 0 });
    const [row] = await db()
      .select()
      .from(contentSettings)
      .where(eq(contentSettings.key, "marketplace_categories"));
    expect(row?.value).toEqual(["Edited"]);
  });
});
