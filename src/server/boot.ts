import "server-only";
import postgres from "postgres";
import { type DbProcess, dbProcess, processPoolMax } from "@/server/db/client";
import { env } from "@/server/env";
import { cacheUrl } from "@/server/jobs/connection";
import type { Redis } from "ioredis";

/**
 * Startup checks for the web server (src/instrumentation.ts) and the worker (P0-19). A failure stops the
 * process: a server that cannot run safely must not serve 500s or run with the wrong privileges (QA-6).
 *   - The server environment parses (variable names only in errors, never values).
 *   - Every environment: each database pool's role is not the schema owner (or a member of it) or a superuser;
 *     only the worker's system pool bypasses RLS (SEC-M2, SECURITY §11, P0-20).
 *   - Staging/production: the web process holds no worker credentials; the connection budget fits
 *     max_connections (P0-18); redis-queue and redis-cache are two different servers with the right eviction
 *     policies (P0-18, AC3).
 */
export async function runBootChecks(): Promise<void> {
  const e = env();
  const kind = dbProcess();
  // Every environment (P0-20): a laptop still on the owner/superuser URL would silently skip RLS.
  for (const pool of bootPools(kind)) {
    const url = e[pool.env];
    if (!url) throw new Error(`${pool.env} is not set (the ${kind} process needs it, P0-20)`);
    const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
    try {
      const problem = databaseRoleProblem(await databaseRoleFacts(sql), pool.bypassRls);
      if (problem)
        throw new Error(`${pool.env}: ${problem} (see .env.example and DECISIONS P0-20)`);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }
  if (e.APP_ENV === "local" || e.APP_ENV === "test") return;
  if (kind === "web" && e.DATABASE_URL_WORKER) {
    throw new Error(
      "DATABASE_URL_WORKER is set: the web process must not hold the BYPASSRLS worker role",
    );
  }
  const sql = postgres(e.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [setting] = await sql<{ max_connections: string }[]>`SHOW max_connections`;
    const budget = connectionBudgetProblem(
      Number(setting?.max_connections ?? 0),
      CONNECTION_BUDGET[e.APP_ENV],
    );
    if (budget) throw new Error(`connection budget: ${budget} (infra/RESOURCES.md)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  const { Redis: RedisClient } = await import("ioredis");
  const connect = (url: string): Redis =>
    new RedisClient(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5_000 });
  const queue = connect(e.REDIS_URL);
  const cache = connect(cacheUrl());
  try {
    const problem = redisPairProblem(await redisFacts(queue), await redisFacts(cache));
    if (problem) throw new Error(`REDIS_URL / REDIS_CACHE_URL: ${problem}`);
  } finally {
    queue.disconnect();
    cache.disconnect();
  }
}

export type RedisFacts = { runId: string; policy: string };

/** The server's identity and eviction policy, from INFO (works where CONFIG is disabled). */
export async function redisFacts(redis: Redis): Promise<RedisFacts> {
  const info = `${await redis.info("server")}\n${await redis.info("memory")}`;
  // `key:value` lines; plain parsing, no regex built from a name.
  const fields = new Map<string, string>();
  for (const line of info.split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at > 0) fields.set(line.slice(0, at), line.slice(at + 1).trim());
  }
  const field = (name: string): string => fields.get(name) ?? "";
  return { runId: field("run_id"), policy: field("maxmemory_policy") };
}

/**
 * Two URL strings can still name one server (another db number, a host alias). One shared allkeys-lru server
 * would let a full cache evict limiter and queue keys (a rate-limit bypass), so compare server identities.
 */
export function redisPairProblem(queue: RedisFacts, cache: RedisFacts): string | null {
  if (!queue.runId || !cache.runId) return "could not read the Redis server identity (INFO server)";
  if (queue.runId === cache.runId) return "queue and cache point at the same Redis server";
  if (queue.policy !== "noeviction")
    return `the queue server evicts keys (maxmemory-policy ${queue.policy || "unknown"}, needs noeviction)`;
  if (cache.policy === "noeviction")
    return "the cache server never evicts (maxmemory-policy noeviction): a full cache would fail writes";
  return null;
}

/** Each pool a process opens, the variable it comes from, and whether that role must bypass RLS. */
export function bootPools(
  kind: DbProcess,
): { env: "DATABASE_URL" | "DATABASE_URL_AUTH" | "DATABASE_URL_WORKER"; bypassRls: boolean }[] {
  if (kind === "test") return bootPools("web").concat(bootPools("worker").slice(1));
  return kind === "web"
    ? [
        { env: "DATABASE_URL", bypassRls: false },
        { env: "DATABASE_URL_AUTH", bypassRls: false },
      ]
    : [
        { env: "DATABASE_URL", bypassRls: false },
        { env: "DATABASE_URL_WORKER", bypassRls: true },
      ];
}

export type RoleFacts = {
  name: string;
  superuser: boolean;
  bypassRls: boolean;
  ownsTables: boolean;
  canCreate: boolean;
};

export async function databaseRoleFacts(sql: postgres.Sql): Promise<RoleFacts | null> {
  // "Owns" includes membership of the owning role (pg_has_role USAGE): a member inherits the owner's rights.
  const [row] = await sql<RoleFacts[]>`
    SELECT r.rolname AS name,
           r.rolsuper AS superuser,
           r.rolbypassrls AS "bypassRls",
           EXISTS (SELECT 1 FROM pg_tables t
                   WHERE t.schemaname = 'public' AND pg_has_role(current_user, t.tableowner, 'USAGE'))
             AS "ownsTables",
           has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreate"
    FROM pg_roles r WHERE r.rolname = current_user`;
  return row ?? null;
}

/**
 * Why this connection's role must not be used, or null when it is a plain data role (SEC-M2, SECURITY §11,
 * P0-20). Never the owner, a member of it, a superuser or a role that can create in public. `bypassRls`: the
 * worker's system pool must be a BYPASSRLS role (moz_worker); every other pool must not be.
 */
export function databaseRoleProblem(row: RoleFacts | null, bypassRls = false): string | null {
  if (!row) return "role not found";
  const reasons = [
    row.superuser ? "is a superuser" : null,
    row.bypassRls && !bypassRls ? "bypasses row-level security" : null,
    !row.bypassRls && bypassRls
      ? "does not bypass row-level security (needs the moz_worker role)"
      : null,
    row.ownsTables ? "owns (or is a member of the owner of) tables in public" : null,
    row.canCreate ? "can create in schema public" : null,
  ].filter((r): r is string => r !== null);
  return reasons.length > 0 ? `the role ${row.name} ${reasons.join(", ")}` : null;
}

type Exit = { exit: (code: number) => void; error: (message: string) => void };

/** Runs `check`; on any failure prints why and exits 1, so the process never serves in a broken state. */
export async function bootOrExit(
  check: () => void | Promise<void>,
  io: Exit = {
    exit: (code) => process.exit(code),
    error: (m) => {
      console.error(m);
    },
  },
): Promise<void> {
  try {
    await check();
  } catch (e) {
    io.error(`[boot] refusing to start: ${e instanceof Error ? e.message : String(e)}`);
    io.exit(1);
  }
}

/**
 * Connection budget (ENGINEERING §6, ARCHITECTURE §12, infra/RESOURCES.md): every pool that can be open at
 * once — web replicas and workers, plus one extra container during a rolling deploy — and the reserved
 * connections (Umami's pool, admin/psql, migrations) must fit in 80% of Postgres `max_connections`.
 */
export const CONNECTION_BUDGET = {
  production: { web: 2, worker: 1, deployOverlap: 1, reserved: 15 },
  staging: { web: 2, worker: 1, deployOverlap: 1, reserved: 5 },
} as const;

export function connectionBudgetProblem(
  maxConnections: number,
  plan: { web: number; worker: number; deployOverlap: number; reserved: number },
  pools: { web: number; worker: number } = {
    web: processPoolMax("web"),
    worker: processPoolMax("worker"),
  },
): string | null {
  // The deploy overlap is counted as a web container (the larger of the two).
  const needed =
    (plan.web + plan.deployOverlap) * pools.web + plan.worker * pools.worker + plan.reserved;
  const allowed = Math.floor(maxConnections * 0.8);
  return needed > allowed
    ? `needs ${String(needed)} connections but 80% of max_connections (${String(maxConnections)}) is ${String(allowed)}`
    : null;
}
