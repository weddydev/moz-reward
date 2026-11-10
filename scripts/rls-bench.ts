/**
 * `pnpm db:rls-bench` (P0-20 AC3): what Row-Level Security costs a typical scoped query, from EXPLAIN ANALYZE.
 * Builds a throwaway database (`<DATABASE_URL_TEST db>_rlsbench`, migrated, 50 shops × 2,000 members), then
 * runs the same shop-scoped page query many times two ways and compares server execution times:
 *   baseline  the owner (superuser locally: RLS bypassed), app filter only
 *   rls       moz_app with SET LOCAL settings, app filter + policies (incl. the app_in_shop() role check)
 * Prints p50/p95 for both, the p95 change, and one plan of each. Local/CI only; drops the database at the end.
 */
import "./load-env";
import postgres from "postgres";
import { ensureLocalLoginRoles, RLS_ROLES, runMigrations } from "../src/server/db/migrate";

const SHOPS = 50;
const MEMBERS_PER_SHOP = 2_000;
const RUNS = 1_000;

const base = process.env.DATABASE_URL_TEST;
if (!base) throw new Error("DATABASE_URL_TEST is not set");
const withDb = (url: string, db: string, user?: { name: string; password: string }): string => {
  const u = new URL(url);
  u.pathname = `/${db}`;
  if (user) {
    u.username = user.name;
    u.password = user.password;
  }
  return u.toString();
};
const benchDb = `${new URL(base).pathname.slice(1)}_rlsbench`;

/** Two shapes: one member by id in a shop (the common case) and a members page (filters 2,000 rows: worst case). */
const QUERIES = {
  lookup: `SELECT id, user_id, joined_at FROM memberships WHERE shop_id = $1 AND id = $2`,
  page: `SELECT id, user_id, joined_at FROM memberships
    WHERE shop_id = $1 AND left_at IS NULL ORDER BY joined_at DESC LIMIT 50 OFFSET 0 + 0 * length($2::text)`,
} as const;

const executionMs = (plan: { "QUERY PLAN": string }[]): number => {
  const line = plan.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Execution Time"));
  return Number(/([\d.]+) ms/.exec(line ?? "")?.[1] ?? NaN);
};
const pct = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? NaN;
};

async function main(): Promise<void> {
  const admin = postgres(withDb(base ?? "", "postgres"), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS "${benchDb}" WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE "${benchDb}"`);
  const ownerUrl = withDb(base ?? "", benchDb);
  await runMigrations(ownerUrl);
  await ensureLocalLoginRoles(
    admin,
    RLS_ROLES.map((r) => withDb(base ?? "", benchDb, { name: r, password: r })),
  );
  const owner = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  const app = postgres(withDb(base ?? "", benchDb, { name: "moz_app", password: "moz_app" }), {
    max: 1,
    onnotice: () => {},
  });
  try {
    // Data: shops, one owner each, members spread over the shops (generate_series, all as the owner).
    await owner.unsafe(`
      INSERT INTO users (id, name, email)
        SELECT gen_random_uuid(), 'u' || g, 'u' || g || '@bench.moz.invalid'
        FROM generate_series(1, ${SHOPS * MEMBERS_PER_SHOP + SHOPS}) g;
      INSERT INTO shops (id, slug, shop_code, name, category, status)
        SELECT gen_random_uuid(), 'shop-' || g, 'Z' || translate(lpad(g::text, 5, '0'), '0123456789', 'CDEFGHJKMN'), 'Shop ' || g, 'cafe', 'active'
        FROM generate_series(1, ${SHOPS}) g;`);
    await owner.unsafe(`
      WITH s AS (SELECT id, row_number() OVER (ORDER BY id) AS n FROM shops),
           u AS (SELECT id, row_number() OVER (ORDER BY id) AS n FROM users)
      INSERT INTO shop_staff (id, shop_id, user_id, role)
        SELECT gen_random_uuid(), s.id, u.id, 'owner' FROM s JOIN u ON u.n = s.n;`);
    await owner.unsafe(`
      WITH s AS (SELECT id, row_number() OVER (ORDER BY id) - 1 AS n FROM shops),
           u AS (SELECT id, row_number() OVER (ORDER BY id) AS n FROM users OFFSET ${SHOPS})
      INSERT INTO memberships (id, user_id, shop_id, joined_at)
        SELECT gen_random_uuid(), u.id, s.id, now() - (u.n || ' minutes')::interval
        FROM u JOIN s ON s.n = (u.n % ${SHOPS});
      ANALYZE;`);
    const [target] = await owner<{ shop: string; staff: string }[]>`
      SELECT s.shop_id::text AS shop, s.user_id::text AS staff FROM shop_staff s LIMIT 1`;
    if (!target) throw new Error("no shop");

    const [member] = await owner<{ id: string }[]>`
      SELECT id::text FROM memberships WHERE shop_id = ${target.shop} LIMIT 1`;
    if (!member) throw new Error("no member");
    const lines: string[] = [
      `[rls-bench] ${String(SHOPS)} shops × ${String(MEMBERS_PER_SHOP)} members, ${String(RUNS)} runs per query and role (first 10% dropped)`,
    ];
    const plans: string[] = [];
    for (const [name, query] of Object.entries(QUERIES)) {
      const explain = `EXPLAIN (ANALYZE, BUFFERS) ${query}`;
      const params = [target.shop, member.id];
      const baseline: number[] = [];
      const rls: number[] = [];
      let rlsPlan = "";
      for (let i = 0; i < RUNS; i++) {
        // Alternate which role goes first, so caching and timer drift fall on both equally.
        const runBase = async (): Promise<void> => {
          baseline.push(
            executionMs(await owner.unsafe<{ "QUERY PLAN": string }[]>(explain, params)),
          );
        };
        const runRls = async (): Promise<void> => {
          const r = await app.begin(async (tx) => {
            await tx`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${target.staff}, true), set_config('app.shop_id', ${target.shop}, true)`;
            return tx.unsafe<{ "QUERY PLAN": string }[]>(explain, params);
          });
          rls.push(executionMs(r));
          if (i === RUNS - 1) rlsPlan = r.map((x) => x["QUERY PLAN"]).join("\n");
        };
        if (i % 2 === 0) {
          await runBase();
          await runRls();
        } else {
          await runRls();
          await runBase();
        }
      }
      const warm = Math.floor(RUNS / 10);
      const b = baseline.slice(warm);
      const r = rls.slice(warm);
      const change = ((pct(r, 95) - pct(b, 95)) / pct(b, 95)) * 100;
      lines.push(
        `${name.padEnd(6)} baseline p50 ${pct(b, 50).toFixed(3)} / p95 ${pct(b, 95).toFixed(3)} ms · rls p50 ${pct(r, 50).toFixed(3)} / p95 ${pct(r, 95).toFixed(3)} ms · p95 change ${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
      );
      plans.push(`--- rls plan: ${name} ---`, rlsPlan);
    }
    // What a request pays on top, client side: the scoped transaction (BEGIN, set_config, COMMIT round trips).
    const plain: number[] = [];
    const scoped: number[] = [];
    const pipelined: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      let t = performance.now();
      await owner.unsafe(QUERIES.lookup, [target.shop, member.id]);
      plain.push(performance.now() - t);
      t = performance.now();
      await app.begin(async (tx) => {
        await tx`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${target.staff}, true), set_config('app.shop_id', ${target.shop}, true)`;
        return tx.unsafe(QUERIES.lookup, [target.shop, member.id]);
      });
      scoped.push(performance.now() - t);
      t = performance.now();
      // For comparison only: set_config and the query pipelined (not used by the app, DECISIONS P0-20).
      await app.begin((tx) => [
        tx`SELECT set_config('app.scope', 'shop', true), set_config('app.user_id', ${target.staff}, true), set_config('app.shop_id', ${target.shop}, true)`,
        tx.unsafe(QUERIES.lookup, [target.shop, member.id]),
      ]);
      pipelined.push(performance.now() - t);
    }
    const warm = Math.floor(RUNS / 10);
    lines.push(
      `client round trip (lookup): plain p95 ${pct(plain.slice(warm), 95).toFixed(3)} ms · scoped transaction p95 ${pct(scoped.slice(warm), 95).toFixed(3)} ms · pipelined (not used) p95 ${pct(pipelined.slice(warm), 95).toFixed(3)} ms (local Docker Desktop)`,
    );
    process.stdout.write([...lines, "", ...plans, ""].join("\n"));
  } finally {
    await owner.end();
    await app.end();
    await admin.unsafe(`DROP DATABASE IF EXISTS "${benchDb}" WITH (FORCE)`);
    await admin.end();
  }
}

main().catch((err: unknown) => {
  console.error("[rls-bench] failed:", err);
  process.exit(1);
});
