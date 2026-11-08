import "../scripts/load-env";
import { runMigrations } from "../src/server/db/migrate";

/** Migrates the dedicated test database once per `vitest run`. Needs `pnpm services:up` locally. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  await runMigrations(url);
}
