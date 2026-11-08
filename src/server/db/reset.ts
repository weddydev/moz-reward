import "../../../scripts/load-env";
import postgres from "postgres";
import { runMigrations } from "./migrate";
import { isDirectRun } from "../../lib/is-direct-run";

/**
 * `pnpm db:reset` (P0-03): wipes the LOCAL database and rebuilds it (drop schemas → migrate → seed).
 * Refuses unless APP_ENV=local and the database host is this machine, so it can never touch staging or
 * production. Drops whole schemas rather than truncating: audit_logs blocks TRUNCATE by design.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertResetAllowed(appEnv: string | undefined, url: string | undefined): string {
  if (appEnv !== "local")
    throw new Error(`db:reset only runs with APP_ENV=local (got ${appEnv ?? "unset"}).`);
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = URL.canParse(url) ? new URL(url).hostname : "";
  if (!LOCAL_HOSTS.has(host))
    throw new Error("db:reset only runs against a database on localhost.");
  return url;
}

async function main(): Promise<void> {
  const url = assertResetAllowed(
    process.env.APP_ENV,
    process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL,
  );
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client.unsafe(`
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public AUTHORIZATION pg_database_owner;
      GRANT USAGE ON SCHEMA public TO PUBLIC;
      CREATE EXTENSION IF NOT EXISTS citext;
    `);
  } finally {
    await client.end();
  }
  await runMigrations(url);
  console.warn("[db] reset: schemas dropped and migrations applied; seeding next");
}

if (isDirectRun(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error("[db] reset refused/failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
