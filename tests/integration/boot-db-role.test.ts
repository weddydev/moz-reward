import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { databaseRoleFacts, databaseRoleProblem } from "@/server/boot";

/** SEC-M2: staging/production must never run as the role that owns the schema. */
describe("[P0-19] boot refuses the database owner role, its members and BYPASSRLS roles", () => {
  const url = new URL(process.env.DATABASE_URL_MIGRATIONS ?? "");
  const problem = async (sql: postgres.Sql, bypassRls = false): Promise<string | null> =>
    databaseRoleProblem(await databaseRoleFacts(sql), bypassRls);
  const owner = postgres(url.toString(), { max: 1, onnotice: () => {} });
  const role = `moz_boot_probe_${String(process.pid)}`;
  const password = "probe-only-not-a-secret";

  afterAll(async () => {
    await owner.unsafe(`DROP OWNED BY ${role}`).catch(() => {});
    await owner.unsafe(`DROP ROLE IF EXISTS ${role}`);
    await owner.end();
  });

  it("names the problem for the owner/superuser role (the local `moz` role is both)", async () => {
    expect(await problem(owner)).toMatch(/superuser|owns tables|can create/);
  });

  it("accepts a plain application role with data rights only", async () => {
    await owner.unsafe(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    await owner.unsafe(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await owner.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await owner.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    const app = new URL(url);
    app.username = role;
    app.password = password;
    const client = postgres(app.toString(), { max: 1, onnotice: () => {} });
    try {
      expect(await problem(client)).toBeNull();
    } finally {
      await client.end();
    }
  });

  it("refuses a role that bypasses RLS, or is a member of the table owner", async () => {
    const app = new URL(url);
    app.username = role;
    app.password = password;
    const asProbe = async (): Promise<string | null> => {
      const client = postgres(app.toString(), { max: 1, onnotice: () => {} });
      try {
        return await problem(client);
      } finally {
        await client.end();
      }
    };
    await owner.unsafe(`ALTER ROLE ${role} BYPASSRLS`);
    expect(await asProbe()).toMatch(/bypasses row-level security/);
    await owner.unsafe(`ALTER ROLE ${role} NOBYPASSRLS`);

    const [tableOwner] = await owner<{ name: string }[]>`
      SELECT tableowner AS name FROM pg_tables WHERE schemaname = 'public' LIMIT 1`;
    await owner.unsafe(`GRANT ${tableOwner?.name ?? "moz"} TO ${role}`);
    try {
      expect(await asProbe()).toMatch(/member of the owner/);
    } finally {
      await owner.unsafe(`REVOKE ${tableOwner?.name ?? "moz"} FROM ${role}`);
    }
  });
});

describe("[P0-20] each pool's role: moz_app and moz_auth never bypass RLS; the worker's system pool must", () => {
  const check = async (envName: string, bypassRls: boolean): Promise<string | null> => {
    const client = postgres(process.env[envName] ?? "", { max: 1, onnotice: () => {} });
    try {
      return databaseRoleProblem(await databaseRoleFacts(client), bypassRls);
    } finally {
      await client.end();
    }
  };

  it("accepts the three roles for their own pools", async () => {
    expect(await check("DATABASE_URL", false)).toBeNull();
    expect(await check("DATABASE_URL_AUTH", false)).toBeNull();
    expect(await check("DATABASE_URL_WORKER", true)).toBeNull();
  });

  it("refuses the worker role where RLS must apply, and the app role as the system pool", async () => {
    expect(await check("DATABASE_URL_WORKER", false)).toMatch(
      /moz_worker bypasses row-level security/,
    );
    expect(await check("DATABASE_URL", true)).toMatch(/does not bypass row-level security/);
  });
});
