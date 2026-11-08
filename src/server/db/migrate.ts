import "../../../scripts/load-env";
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
 * Applies pending migrations in one transaction (drizzle's migrator); already-applied ones are skipped, so a
 * re-run is a no-op. Usage: `pnpm db:migrate` (app DB) or `pnpm db:migrate --test` (DATABASE_URL_TEST).
 */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await assertExtensionsAvailable(async (name) => {
      const rows = await client`SELECT 1 FROM pg_available_extensions WHERE name = ${name}`;
      return rows.length > 0;
    });
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const useTest = process.argv.includes("--test");
  const url = useTest
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) throw new Error(useTest ? "DATABASE_URL_TEST is not set" : "DATABASE_URL is not set");
  const started = Date.now();
  await runMigrations(url);
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
