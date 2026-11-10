import "../../../scripts/load-env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { isDirectRun } from "../../lib/is-direct-run";

/** Extensions the migrations need. Checked first so a missing one fails with instructions, not a raw error. */
export const REQUIRED_EXTENSIONS = ["postgis"] as const;

export class MissingExtensionError extends Error {
  constructor(names: string[]) {
    super(
      `Postgres extension not available on this server: ${names.join(", ")}. ` +
        "Locally run `pnpm services:up` (the Docker image includes PostGIS). " +
        "On a managed database, enable the extension in its console (Neon: available by default; run " +
        "`CREATE EXTENSION postgis;` as the database owner), then run the migrations again.",
    );
    this.name = "MissingExtensionError";
  }
}

/** Throws MissingExtensionError naming every required extension the server cannot install. */
export async function assertExtensionsAvailable(
  available: (name: string) => Promise<boolean>,
): Promise<void> {
  const missing: string[] = [];
  for (const name of REQUIRED_EXTENSIONS) if (!(await available(name))) missing.push(name);
  if (missing.length > 0) throw new MissingExtensionError(missing);
}

/**
 * Session settings for every migration connection (ENGINEERING §6, ARCHITECTURE §9): a migration that waits
 * on a lock fails after 5 s instead of queueing every query behind it, and no statement runs for ever.
 */
/** Milliseconds (Postgres shows them as "5s" and "5min"). */
export const MIGRATION_SESSION = { lock_timeout: 5_000, statement_timeout: 300_000 } as const;
/** Concurrent index builds can take longer than a normal statement (they never block writes). */
const CONCURRENT_STATEMENT_TIMEOUT = "30min";

export const migrationClient = (url: string): postgres.Sql =>
  postgres(url, { max: 1, onnotice: () => {}, connection: { ...MIGRATION_SESSION } });

const CREATE_NAME = /INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+"?(\w+)"?/i;

/**
 * Non-transactional migrations (P0-18, C-18): `drizzle/concurrent/*.sql`, one CREATE/DROP INDEX
 * CONCURRENTLY each (checked by scripts/check-migrations.ts), applied in name order after the Drizzle
 * migrations, outside any transaction, once each (`drizzle.moz_concurrent_migrations`). A build that crashed
 * leaves an INVALID index, which `IF NOT EXISTS` would silently keep: it is dropped first and rebuilt.
 */
export async function runConcurrentMigrations(
  client: postgres.Sql,
  dir = "./drizzle/concurrent",
): Promise<string[]> {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
  if (files.length === 0) return [];
  await client`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await client`CREATE TABLE IF NOT EXISTS drizzle.moz_concurrent_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const applied: string[] = [];
  for (const name of files) {
    const done = await client`SELECT 1 FROM drizzle.moz_concurrent_migrations WHERE name = ${name}`;
    if (done.length > 0) continue;
    const sql = readFileSync(path.join(dir, name), "utf8");
    const index = CREATE_NAME.exec(sql)?.[1];
    if (index) {
      const invalid = await client`
        SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = ${index} AND NOT i.indisvalid`;
      if (invalid.length > 0) await client.unsafe(`DROP INDEX CONCURRENTLY IF EXISTS "${index}"`);
    }
    await client.unsafe(`SET statement_timeout = '${CONCURRENT_STATEMENT_TIMEOUT}'`);
    try {
      await client.unsafe(sql);
    } finally {
      await client.unsafe(`SET statement_timeout = ${String(MIGRATION_SESSION.statement_timeout)}`);
    }
    await client`INSERT INTO drizzle.moz_concurrent_migrations (name) VALUES (${name})`;
    applied.push(name);
  }
  return applied;
}
/**
 * Applies pending migrations in one transaction (drizzle's migrator), then the non-transactional ones in
 * drizzle/concurrent/; already-applied ones are skipped, so a re-run is a no-op. Lock and statement timeouts
 * come from MIGRATION_SESSION. Usage: `pnpm db:migrate` (app DB) or `pnpm db:migrate --test` (DATABASE_URL_TEST).
 */
export async function runMigrations(url: string): Promise<void> {
  const client = migrationClient(url);
  try {
    await assertExtensionsAvailable(async (name) => {
      const rows = await client`SELECT 1 FROM pg_available_extensions WHERE name = ${name}`;
      return rows.length > 0;
    });
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    await runConcurrentMigrations(client);
  } finally {
    await client.end();
  }
}

/** The RLS roles of drizzle/0009_rls.sql (group roles; each environment gives them LOGIN + a password). */
export const RLS_ROLES = ["moz_app", "moz_auth", "moz_worker"] as const;

/**
 * Local, test and CI only (P0-20): the roles the connection URLs name get LOGIN with that URL's password, so a
 * fresh Docker volume works with `.env.example`. Staging/production roles and passwords come from the VPS
 * bootstrap (P0-15, C-32), never from here. Needs a superuser (the local migration role is one).
 */
export async function ensureLocalLoginRoles(
  client: postgres.Sql,
  urls: ReadonlyArray<string | undefined>,
): Promise<string[]> {
  const done: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const u = new URL(raw);
    const role = decodeURIComponent(u.username);
    if (!(RLS_ROLES as readonly string[]).includes(role) || done.includes(role)) continue;
    const literal = `'${decodeURIComponent(u.password).replaceAll("'", "''")}'`;
    // The role name is one of RLS_ROLES (checked above); ALTER ROLE takes no bind parameters.
    await client.unsafe(`ALTER ROLE ${role} LOGIN PASSWORD ${literal}`);
    done.push(role);
  }
  return done;
}

export const localRoleUrls = (): (string | undefined)[] => [
  process.env.DATABASE_URL,
  process.env.DATABASE_URL_AUTH,
  process.env.DATABASE_URL_WORKER,
];

async function main(): Promise<void> {
  const useTest = process.argv.includes("--test");
  const url = useTest
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) throw new Error(useTest ? "DATABASE_URL_TEST is not set" : "DATABASE_URL is not set");
  const started = Date.now();
  await runMigrations(url);
  const appEnv = process.env.APP_ENV;
  if (appEnv === "local" || appEnv === "test") {
    const client = migrationClient(url);
    try {
      await ensureLocalLoginRoles(client, localRoleUrls());
    } finally {
      await client.end();
    }
  }
  console.warn(
    `[db] migrations applied to ${useTest ? "test" : "app"} database in ${String(Date.now() - started)}ms`,
  );
}

if (isDirectRun(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(
      "[db] migration failed:",
      err instanceof MissingExtensionError ? err.message : err,
    );
    process.exit(1);
  });
}
