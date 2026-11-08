/**
 * Integration-test database isolation (TESTING §6):
 *  - `<base>_template` is migrated once per run,
 *  - each Vitest worker gets `<base>_w<poolId>` cloned from the template,
 *  - every test file starts with all app tables truncated.
 */
import postgres from "postgres";
import { runMigrations } from "../../src/server/db/migrate";

export const INTEGRATION_WORKERS = 4;

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export function baseTestUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  return url;
}

const baseName = (): string => new URL(baseTestUrl()).pathname.slice(1);
export const templateName = (): string => `${baseName()}_template`;
export const workerDbName = (poolId: string | number): string => `${baseName()}_w${poolId}`;
export const workerDbUrl = (poolId: string | number): string => withDatabase(baseTestUrl(), workerDbName(poolId));

async function admin<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(withDatabase(baseTestUrl(), "postgres"), { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Fails fast with a friendly message when Docker/Postgres isn't running. */
export async function assertDatabaseReachable(): Promise<void> {
  try {
    await admin((sql) => sql`select 1`);
  } catch {
    throw new Error("Postgres is not reachable. Start Docker Desktop, then run `pnpm services:up`.");
  }
}

/** (Re)builds the template DB with all migrations, then (re)creates one DB per worker from it. */
export async function prepareWorkerDatabases(workers = INTEGRATION_WORKERS): Promise<void> {
  const template = templateName();
  await admin(async (sql) => {
    for (let i = 1; i <= workers; i++) await sql.unsafe(`DROP DATABASE IF EXISTS "${workerDbName(i)}" WITH (FORCE)`);
    await sql.unsafe(`DROP DATABASE IF EXISTS "${template}" WITH (FORCE)`);
    await sql.unsafe(`CREATE DATABASE "${template}"`);
  });
  await runMigrations(withDatabase(baseTestUrl(), template));
  await admin(async (sql) => {
    for (let i = 1; i <= workers; i++) await sql.unsafe(`CREATE DATABASE "${workerDbName(i)}" TEMPLATE "${template}"`);
  });
}

/** Empties every app table (triggers disabled for the session so append-only tables can be reset). */
export async function truncateAll(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename not in ('spatial_ref_sys')`;
    if (rows.length === 0) return;
    const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL session_replication_role = replica");
      await tx.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    });
  } finally {
    await sql.end();
  }
}
