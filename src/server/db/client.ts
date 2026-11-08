import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  const client = postgres(url, {
    max: 10,
    // Neon/PgBouncer pooled URLs run in transaction mode: no server-side prepared statements.
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __mozDb?: Db };

/** Shared Drizzle client (one pool per process; survives Next dev hot reloads). */
export function db(): Db {
  globalForDb.__mozDb ??= createDb(env().DATABASE_URL);
  return globalForDb.__mozDb;
}

export type Database = Db;
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
