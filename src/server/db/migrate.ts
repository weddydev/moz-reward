import "../../../scripts/load-env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Usage: `pnpm db:migrate` (app DB) or `pnpm db:migrate --test` (DATABASE_URL_TEST). */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.end();
  }
}

async function main() {
  const useTest = process.argv.includes("--test");
  const url = useTest
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
  if (!url) throw new Error(useTest ? "DATABASE_URL_TEST is not set" : "DATABASE_URL is not set");
  const started = Date.now();
  await runMigrations(url);
  console.warn(
    `[db] migrations applied to ${useTest ? "test" : "app"} database in ${Date.now() - started}ms`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error("[db] migration failed:", err);
    process.exit(1);
  });
}
