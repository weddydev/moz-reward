import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import {
  bootPools,
  DANGEROUS_BUILTIN_ROLES,
  type DataRole,
  databaseRoleFacts,
  databaseRoleProblem,
} from "@/server/boot";

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

  it("[P0-15] refuses a data login with CREATEROLE/CREATEDB/REPLICATION or a server-file/program role", async () => {
    const app = new URL(url);
    app.username = role;
    app.password = password;
    const asProbe = async (): Promise<string | null> => {
      const client = postgres(app.toString(), { max: 1, onnotice: () => {} });
      try {
        return databaseRoleProblem(await databaseRoleFacts(client));
      } finally {
        await client.end();
      }
    };
    for (const [attr, off, message] of [
      ["CREATEROLE", "NOCREATEROLE", /can create roles/],
      ["CREATEDB", "NOCREATEDB", /can create databases/],
      ["REPLICATION", "NOREPLICATION", /can replicate/],
    ] as const) {
      await owner.unsafe(`ALTER ROLE ${role} ${attr}`);
      try {
        expect(await asProbe()).toMatch(message);
      } finally {
        await owner.unsafe(`ALTER ROLE ${role} ${off}`);
      }
    }
    for (const builtin of DANGEROUS_BUILTIN_ROLES) {
      await owner.unsafe(`GRANT ${builtin} TO ${role}`);
      try {
        expect(await asProbe()).toMatch(new RegExp(`is a member of ${builtin}`));
      } finally {
        await owner.unsafe(`REVOKE ${builtin} FROM ${role}`);
      }
    }
    expect(await asProbe()).toBeNull();
  });

  it("[P0-15] C-32: refuses to start while moz_rls (owner of the SECURITY DEFINER helpers) can log in", async () => {
    const client = postgres(process.env.DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
    try {
      expect(databaseRoleProblem(await databaseRoleFacts(client), false, "moz_app")).toBeNull();
      await owner.unsafe(`ALTER ROLE moz_rls LOGIN`);
      try {
        expect(databaseRoleProblem(await databaseRoleFacts(client), false, "moz_app")).toMatch(
          /moz_rls can log in/,
        );
      } finally {
        await owner.unsafe(`ALTER ROLE moz_rls NOLOGIN`);
      }
    } finally {
      await client.end();
    }
  });

  it("[P0-15] C-33: a web login that can SET ROLE to moz_worker, moz_auth or moz_rls is refused", async () => {
    const app = new URL(url);
    app.username = role;
    app.password = password;
    const asProbe = async (expected: DataRole): Promise<string | null> => {
      const client = postgres(app.toString(), { max: 1, onnotice: () => {} });
      try {
        return databaseRoleProblem(await databaseRoleFacts(client), false, expected);
      } finally {
        await client.end();
      }
    };
    expect(await asProbe("moz_app")).toMatch(/is not a member of moz_app/);
    await owner.unsafe(`GRANT moz_app TO ${role}`);
    try {
      expect(await asProbe("moz_app")).toBeNull();
      for (const other of ["moz_worker", "moz_auth", "moz_rls"]) {
        // NOINHERIT still allows SET ROLE (PG 16+ grant options): membership itself is refused.
        await owner.unsafe(`GRANT ${other} TO ${role} WITH INHERIT FALSE`);
        try {
          expect(await asProbe("moz_app")).toMatch(new RegExp(`can act as ${other}`));
        } finally {
          await owner.unsafe(`REVOKE ${other} FROM ${role}`);
        }
      }
    } finally {
      await owner.unsafe(`REVOKE moz_app FROM ${role}`);
    }
  });
});

describe("[P0-20] each pool's role: moz_app and moz_auth never bypass RLS; the worker's system pool must", () => {
  const check = async (
    envName: string,
    bypassRls: boolean,
    role?: DataRole,
  ): Promise<string | null> => {
    const client = postgres(process.env[envName] ?? "", { max: 1, onnotice: () => {} });
    try {
      return databaseRoleProblem(await databaseRoleFacts(client), bypassRls, role);
    } finally {
      await client.end();
    }
  };

  it("accepts the three roles for their own pools", async () => {
    expect(await check("DATABASE_URL", false, "moz_app")).toBeNull();
    expect(await check("DATABASE_URL_AUTH", false, "moz_auth")).toBeNull();
    expect(await check("DATABASE_URL_WORKER", true, "moz_worker")).toBeNull();
  });

  it("[P0-15] C-33: each URL must log in as its pool's role, never another data role", async () => {
    // Every pool boot opens (web: app + auth; worker: app + system) names the role its URL must be.
    expect(bootPools("web").map((p) => [p.env, p.role])).toEqual([
      ["DATABASE_URL", "moz_app"],
      ["DATABASE_URL_AUTH", "moz_auth"],
    ]);
    expect(bootPools("worker").map((p) => [p.env, p.role])).toEqual([
      ["DATABASE_URL", "moz_app"],
      ["DATABASE_URL_WORKER", "moz_worker"],
    ]);
    // Swapped URLs (both NOBYPASSRLS, so the bypass check alone would pass them).
    expect(await check("DATABASE_URL_AUTH", false, "moz_app")).toMatch(
      /moz_auth is not a member of moz_app/,
    );
    expect(await check("DATABASE_URL", false, "moz_auth")).toMatch(
      /moz_app is not a member of moz_auth/,
    );
  });

  it("refuses the worker role where RLS must apply, and the app role as the system pool", async () => {
    expect(await check("DATABASE_URL_WORKER", false)).toMatch(
      /moz_worker bypasses row-level security/,
    );
    expect(await check("DATABASE_URL", true)).toMatch(/does not bypass row-level security/);
  });
});
