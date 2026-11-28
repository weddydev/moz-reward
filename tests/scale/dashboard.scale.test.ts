import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { londonDays } from "@/lib/dashboard/kpis";
import { mintShopScope } from "@/server/authz/scope";
import { observeQueries, testOwnerDb as db } from "@/server/db/client";
import { transaction } from "@/server/repos/_base";
import { readDailyTotals } from "@/server/repos/dashboard";
import { makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * P2-01 acceptance: with a 50k-row ledger for the shop each Overview KPI query runs in < 50 ms, on an index scan,
 * never a sequential scan of the ledger. Opt-in, never in `test:int` (seconds of seeding): `pnpm test:scale`.
 *
 * The statements are the repo's own: `readDailyTotals` runs once with the test query observer on, and each SELECT
 * it sent is EXPLAINed (ANALYZE, BUFFERS) as the app role under the owner's RLS settings, so the plan is the one
 * production gets. The target shop has 50k ledger rows over 180 days (earn plus some bonus and reversal rows) and
 * 4,000 members; nine other shops add another 50k rows, so the shop filter has real work to do.
 */
const TARGET_ROWS = Number(process.env.SCALE_LEDGER_ROWS ?? 50_000);
const OTHER_SHOPS = 9;
const MEMBERS = 4_000;
const DAYS = 180;
const LIMIT_MS = 50;

const rowsOf = (res: unknown): Record<string, unknown>[] =>
  Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : ((res as { rows?: Record<string, unknown>[] }).rows ?? []);

/** A bound parameter as an SQL literal (test only: the values are the repo's own uuids, instants and enums). */
function literal(v: unknown): string {
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "number") return String(v);
  return `'${String(v).replaceAll("'", "''")}'`;
}

function inline(text: string, params: readonly unknown[]): string {
  return text.replace(/\$(\d+)/g, (_, n: string) => literal(params[Number(n) - 1]));
}

describe("[P2-01] dashboard KPI queries on a 50k-row ledger", () => {
  it(
    `each KPI query < ${String(LIMIT_MS)} ms with an index scan, no seq scan on the ledger`,
    { timeout: 10 * 60_000 },
    async () => {
      const owner = await makeUser();
      const shops = await Promise.all(
        Array.from({ length: OTHER_SHOPS + 1 }, () => makeShop({ status: "active" })),
      );
      const target = shops[0];
      if (!target) throw new Error("no shop");
      await makeStaff(target.id, owner.id, "owner");
      const shopIds = shops.map((s) => s.id);

      await db().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL session_replication_role = replica`);
        await tx.execute(sql`SET LOCAL statement_timeout = 0`);
        await tx.execute(sql`
          CREATE TEMP TABLE scale_m ON COMMIT DROP AS
          SELECT gen_random_uuid() AS id, gen_random_uuid() AS uid, s.shop_id, g - 1 AS rn,
                 now() - (random() * ${DAYS}) * interval '1 day' AS joined_at
            FROM unnest(${`{${shopIds.join(",")}}`}::uuid[]) AS s(shop_id), generate_series(1, ${MEMBERS}) g`);
        await tx.execute(sql`
          INSERT INTO users (id, name, email, email_verified)
          SELECT uid, 'Scale member', 'scale-' || uid || '@test.moz.invalid', true FROM scale_m`);
        await tx.execute(sql`
          INSERT INTO memberships (id, user_id, shop_id, joined_at)
          SELECT id, uid, shop_id, joined_at FROM scale_m`);
        // TARGET_ROWS for the target shop, the same again spread over the others: 90% earn, the rest bonus or
        // reversal, at random instants over the last DAYS days.
        await tx.execute(sql`
          WITH r AS (
            SELECT g, CASE WHEN g <= ${TARGET_ROWS} THEN ${target.id}::uuid
                           ELSE (${`{${shopIds.slice(1).join(",")}}`}::uuid[])[1 + g % ${OTHER_SHOPS}] END AS shop_id
              FROM generate_series(1, ${TARGET_ROWS * 2}) g)
          INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, idempotency_key, ref, created_at)
          SELECT gen_random_uuid(), m.id, r.shop_id,
                 (CASE WHEN r.g % 10 < 9 THEN 'earn' WHEN r.g % 20 = 9 THEN 'bonus_streak' ELSE 'reversal' END)::ledger_type,
                 CASE WHEN r.g % 10 < 9 THEN 100 WHEN r.g % 20 = 9 THEN 50 ELSE -100 END,
                 'scale:dash:' || r.g || ':' || gen_random_uuid(), '{}'::jsonb,
                 now() - (random() * ${DAYS}) * interval '1 day'
            FROM r JOIN scale_m m ON m.shop_id = r.shop_id AND m.rn = r.g % ${MEMBERS}`);
      });
      // Production tables have autovacuum's statistics; a fresh bulk load has none until ANALYZE.
      await db().execute(sql`ANALYZE ledger_entries`);
      await db().execute(sql`ANALYZE memberships`);
      const [count] = rowsOf(
        await db().execute(
          sql`SELECT count(*)::int AS n FROM ledger_entries WHERE shop_id = ${target.id}`,
        ),
      );
      expect(Number(count?.n)).toBeGreaterThanOrEqual(TARGET_ROWS);

      const scope = mintShopScope({ userId: owner.id, shopId: target.id, role: "owner" });
      const days = londonDays(new Date());
      const range = { from: days[0]?.start ?? new Date(), to: days.at(-1)?.end ?? new Date() };
      const sent: { text: string; params: readonly unknown[] }[] = [];
      const stop = observeQueries((text, params) => {
        if (/^\s*select/i.test(text) && !text.includes("set_config")) sent.push({ text, params });
      });
      let totals: Awaited<ReturnType<typeof readDailyTotals>>;
      try {
        totals = await readDailyTotals(scope, range);
      } finally {
        stop();
      }
      expect(sent).toHaveLength(2); // the ledger read and the joins read
      expect([...totals.values()].some((t) => t.visits > 0)).toBe(true);

      const lines = [
        `[P2-01] ${String(TARGET_ROWS)} ledger rows for the shop (+${String(TARGET_ROWS)} in ${String(OTHER_SHOPS)} other shops), ${String(MEMBERS)} members each; window ${range.from.toISOString()} – ${range.to.toISOString()}`,
      ];
      for (const [i, q] of sent.entries()) {
        const name = q.text.includes("ledger_entries")
          ? "ledger (visits + gold)"
          : "memberships (joins)";
        const explain = `EXPLAIN (ANALYZE, BUFFERS) ${inline(q.text, q.params)}`;
        // Warm once (a fresh connection's first plan pays catalogue lookups), then the measured run.
        await transaction(scope, (tx) => tx.execute(sql.raw(explain)));
        const plan = rowsOf(await transaction(scope, (tx) => tx.execute(sql.raw(explain))))
          .map((r) => String(r["QUERY PLAN"]))
          .join("\n");
        const ms = Number(/Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? Number.NaN);
        lines.push(`--- query ${String(i + 1)}: ${name}: ${ms.toFixed(3)} ms ---`, plan);
        expect(ms, `${name} execution time`).toBeLessThan(LIMIT_MS);
        expect(plan, `${name} uses an index`).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
        expect(plan, `${name}: no seq scan on the ledger`).not.toMatch(
          /Seq Scan on ledger_entries/,
        );
      }
      const report = lines.join("\n");
      // Vitest hides a passing test's console: the evidence goes to .artifacts/ as well.
      mkdirSync(".artifacts", { recursive: true });
      writeFileSync(".artifacts/p2-01-dashboard-explain.txt", report);
      process.stderr.write(`${report}\n`);
    },
  );
});
