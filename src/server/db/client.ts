import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

/**
 * Per-process statement limits (ENGINEERING §6): a web request never waits more than 5 s on one query; the
 * worker's batched jobs get 60 s. `idle_in_transaction_session_timeout` frees locks a crashed request left.
 */
export const DB_SESSION = {
  web: { statement_timeout: 5_000, idle_in_transaction_session_timeout: 15_000 },
  worker: { statement_timeout: 60_000, idle_in_transaction_session_timeout: 60_000 },
} as const;
export type DbProcess = keyof typeof DB_SESSION;

/** Connections per process (the connection budget, ARCHITECTURE §12, is checked at boot against this). */
export const DB_POOL_MAX = 10;

function createDb(url: string, kind: DbProcess) {
  const client = postgres(url, {
    max: DB_POOL_MAX,
    // Neon/PgBouncer pooled URLs run in transaction mode: no server-side prepared statements.
    prepare: false,
    onnotice: () => {},
    connection: { ...DB_SESSION[kind] },
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __mozDb?: Db; __mozDbProcess?: DbProcess };

/** The worker calls this first (before any query): its pool then uses the worker limits. */
export function setDbProcess(kind: DbProcess): void {
  if (globalForDb.__mozDb && globalForDb.__mozDbProcess !== kind) {
    throw new Error("setDbProcess() must run before the first database query");
  }
  globalForDb.__mozDbProcess = kind;
}

/** Shared Drizzle client (one pool per process; survives Next dev hot reloads). */
export function db(): Db {
  if (!globalForDb.__mozDb) {
    globalForDb.__mozDbProcess ??= "web";
    globalForDb.__mozDb = createDb(env().DATABASE_URL, globalForDb.__mozDbProcess);
  }
  return globalForDb.__mozDb;
}

export type Database = Db;
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
