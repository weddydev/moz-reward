import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MIGRATIONS or DATABASE_URL must be set");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: { url },
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
});
