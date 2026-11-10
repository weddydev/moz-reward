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
  /** Integration tests run web and worker code in one process (APP_ENV=test only). */
  test: { statement_timeout: 5_000, idle_in_transaction_session_timeout: 15_000 },
} as const;
export type DbProcess = keyof typeof DB_SESSION;

/**
 * One pool per database role (P0-20, DECISIONS):
 *   app    `moz_app`, every scoped query (customer/shop/admin/public) under RLS — DATABASE_URL
 *   auth   `moz_auth`, Better Auth and identity lookups (src/server/auth only) — DATABASE_URL_AUTH
 *   system `moz_worker` (BYPASSRLS), cross-shop sweeps in the worker and CLI — DATABASE_URL_WORKER
 * The web process opens app + auth; the worker opens app (tenant jobs) + system. Sizes per process feed the
 * connection budget checked at boot (src/server/boot.ts, infra/RESOURCES.md).
 */
export type DbRole = "app" | "auth" | "system";
export const DB_POOL_MAX: Record<DbProcess, Partial<Record<DbRole, number>>> = {
  web: { app: 10, auth: 4 },
  worker: { app: 4, system: 8 },
  test: { app: 5, auth: 3, system: 4 },
};

/** Connections one process of this kind may hold at most (all its pools). */
export const processPoolMax = (kind: DbProcess): number =>
  Object.values(DB_POOL_MAX[kind]).reduce((a, b) => a + b, 0);

const URL_NAME = {
  app: "DATABASE_URL",
  auth: "DATABASE_URL_AUTH",
  system: "DATABASE_URL_WORKER",
} as const;

function createDb(url: string, kind: DbProcess, max: number) {
  const client = postgres(url, {
    max,
    // A transaction-mode pooler (PgBouncer, ARCHITECTURE §12) needs no server-side prepared statements.
    prepare: false,
    onnotice: () => {},
    connection: { ...DB_SESSION[kind] },
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as {
  __mozDbs?: Partial<Record<DbRole, Db>>;
  __mozDbProcess?: DbProcess;
};

/** The worker calls this first (before any query): its pools then use the worker limits and sizes. */
export function setDbProcess(kind: DbProcess): void {
  if (kind === "test" && env().APP_ENV !== "test") {
    throw new Error(
      'the "test" database process (all role pools in one process) is for APP_ENV=test only',
    );
  }
  if (globalForDb.__mozDbs && globalForDb.__mozDbProcess !== kind) {
    throw new Error("setDbProcess() must run before the first database query");
  }
  globalForDb.__mozDbProcess = kind;
}

export const dbProcess = (): DbProcess => globalForDb.__mozDbProcess ?? "web";

/** Shared Drizzle client for one role (one pool per role per process; survives Next dev hot reloads). */
export function dbAs(role: DbRole): Db {
  globalForDb.__mozDbProcess ??= "web";
  const pools = (globalForDb.__mozDbs ??= {});
  const existing = pools[role];
  if (existing) return existing;
  const kind = globalForDb.__mozDbProcess;
  const max = DB_POOL_MAX[kind][role];
  if (max === undefined) {
    throw new Error(`the ${kind} process has no "${role}" database pool (P0-20 role separation)`);
  }
  const url = env()[URL_NAME[role]];
  if (!url) throw new Error(`${URL_NAME[role]} is not set (needed for the "${role}" pool)`);
  const created = createDb(url, kind, max);
  pools[role] = created;
  return created;
}

/** Closes every pool this process opened (worker/CLI shutdown, tests). */
export async function closeDbPools(): Promise<void> {
  const pools = globalForDb.__mozDbs ?? {};
  delete globalForDb.__mozDbs;
  await Promise.all(Object.values(pools).map((p) => p.$client.end({ timeout: 5 })));
}

const globalForOwner = globalThis as unknown as { __mozOwnerDb?: Db };

/**
 * Test fixtures and assertions only (APP_ENV=test): the migration/owner connection (DATABASE_URL_MIGRATIONS),
 * which is a superuser on the local and CI Postgres and so sees every row. App code under test uses the RLS
 * roles above; only factories and test checks use this, so the tests exercise the real walls.
 */
export function testOwnerDb(): Db {
  const e = env();
  if (e.APP_ENV !== "test") throw new Error("testOwnerDb() is only available in tests");
  if (!globalForOwner.__mozOwnerDb) {
    if (!e.DATABASE_URL_MIGRATIONS) throw new Error("DATABASE_URL_MIGRATIONS is not set");
    globalForOwner.__mozOwnerDb = createDb(e.DATABASE_URL_MIGRATIONS, "web", 4);
  }
  return globalForOwner.__mozOwnerDb;
}

export type Database = Db;
export type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
