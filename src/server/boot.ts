import "server-only";
import postgres from "postgres";
import { DB_POOL_MAX } from "@/server/db/client";
import { env } from "@/server/env";

/**
 * Startup checks for the web server (src/instrumentation.ts) and the worker (P0-19). A failure stops the
 * process: a server that cannot run safely must not serve 500s or run with the wrong privileges (QA-6).
 *   - The server environment parses (variable names only in errors, never values).
 *   - Staging/production: the database role is not the schema owner (or a member of it), a superuser or a
 *     BYPASSRLS role (SEC-M2, SECURITY §11); the connection budget fits max_connections (P0-18).
 */
export async function runBootChecks(): Promise<void> {
  const e = env();
  if (e.APP_ENV === "local" || e.APP_ENV === "test") return;
  const sql = postgres(e.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const problem = await databaseRoleProblem(sql);
    if (problem) throw new Error(`DATABASE_URL: ${problem} (use the app role, not the owner)`);
    const [setting] = await sql<{ max_connections: string }[]>`SHOW max_connections`;
    const budget = connectionBudgetProblem(
      Number(setting?.max_connections ?? 0),
      CONNECTION_BUDGET[e.APP_ENV],
    );
    if (budget) throw new Error(`connection budget: ${budget} (infra/RESOURCES.md)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Why this connection's role must not run the app, or null when it is a plain data role. */
export async function databaseRoleProblem(sql: postgres.Sql): Promise<string | null> {
  // "Owns" includes membership of the owning role (pg_has_role USAGE): a member inherits the owner's rights.
  const [row] = await sql<
    { superuser: boolean; bypassRls: boolean; ownsTables: boolean; canCreate: boolean }[]
  >`
    SELECT r.rolsuper AS superuser,
           r.rolbypassrls AS "bypassRls",
           EXISTS (SELECT 1 FROM pg_tables t
                   WHERE t.schemaname = 'public' AND pg_has_role(current_user, t.tableowner, 'USAGE'))
             AS "ownsTables",
           has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreate"
    FROM pg_roles r WHERE r.rolname = current_user`;
  if (!row) return "role not found";
  const reasons = [
    row.superuser ? "is a superuser" : null,
    row.bypassRls ? "bypasses row-level security" : null,
    row.ownsTables ? "owns (or is a member of the owner of) tables in public" : null,
    row.canCreate ? "can create in schema public" : null,
  ].filter((r): r is string => r !== null);
  return reasons.length > 0 ? `the role ${reasons.join(", ")}` : null;
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
  poolMax: number = DB_POOL_MAX,
): string | null {
  const needed = (plan.web + plan.worker + plan.deployOverlap) * poolMax + plan.reserved;
  const allowed = Math.floor(maxConnections * 0.8);
  return needed > allowed
    ? `needs ${String(needed)} connections but 80% of max_connections (${String(maxConnections)}) is ${String(allowed)}`
    : null;
}
