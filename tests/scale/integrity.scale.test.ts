import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { replayLedger } from "@/lib/loyalty/replay";
import { systemScope } from "@/server/authz/scope";
import { testOwnerDb as db } from "@/server/db/client";
import { SWEEPS } from "@/server/ops/sweeps";
import { versionsOf } from "@/server/repos/integrity";
import { limiterRedis } from "@/server/security/rate-limit";
import { INTEGRITY_BATCH, runIntegrityCheck } from "@/server/services/integrity-job";
import { makeProgramme, makeShop, makeStaff, makeUser } from "@/server/testing/factories";

/**
 * C-110 (P1-D close review → P1-18): the nightly integrity run at 100k memberships finishes inside its sweep's
 * `maxRunSec`, and the reward-redeemed-twice count uses the partial index from migration 0036. Opt-in, never in
 * `test:int` (minutes of seeding): `pnpm test:scale` (SCALE=1; the worker database is dropped by the next run).
 *
 * The data is generated in SQL, past the app's triggers (the table owner, `session_replication_role = replica`),
 * shaped like the real flows: per member 0–7 approved visits, each a request, a receipt numbered 1..n per shop and
 * an `earn` row; members with a full ingot hold a reward, half of them redeemed (a 0-gold `redeem` row). Counters
 * come from `replayLedger` on the same rows, so a clean run means every check read every row and agreed.
 */
const SHOPS = Number(process.env.SCALE_SHOPS ?? 100);
const PER_SHOP = Number(process.env.SCALE_PER_SHOP ?? 1_000);
const VISIT_GOLD = 150;
const PATTERNS = 8; // member i gets i % 8 visits
const JOBS = systemScope("integrity-scale test");
const rowsOf = (res: unknown): Record<string, unknown>[] =>
  Array.isArray(res)
    ? (res as Record<string, unknown>[])
    : ((res as { rows?: Record<string, unknown>[] }).rows ?? []);

describe("[P1-18] integrity reconciliation at scale (C-110)", () => {
  it(
    `checks ${SHOPS * PER_SHOP} memberships inside maxRunSec, and the redeem count uses its partial index`,
    { timeout: 40 * 60_000 },
    async () => {
      const staffUser = await makeUser();
      const shops = await Promise.all(
        Array.from({ length: SHOPS }, () => makeShop({ status: "active" })),
      );
      await Promise.all(
        shops.flatMap((s) => [makeProgramme(s.id, 1_000), makeStaff(s.id, staffUser.id, "owner")]),
      );
      const shopIds = shops.map((s) => s.id);

      // Expected counters per pattern, from the engine itself.
      const joinedAt = new Date(Date.now() - 2 * 86_400_000);
      const versions = (await versionsOf(JOBS, [shopIds[0] as string])).get(shopIds[0] as string);
      const patterns = Array.from({ length: PATTERNS }, (_, p) => {
        const r = replayLedger({
          joinedAt,
          versions: versions ?? [],
          rows: Array.from({ length: p }, (_, k) => ({
            type: "earn",
            points: VISIT_GOLD,
            requestId: `00000000-0000-4000-8000-00000000000${k}`,
            createdAt: new Date(joinedAt.getTime() + (k + 1) * 60_000),
            ref: {},
          })),
        });
        return { p, progress: r.progress, ingots: r.ingotsCompleted };
      });
      expect(patterns.some((x) => x.ingots > 0)).toBe(true);

      const seedStart = Date.now();
      await db().transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL session_replication_role = replica`);
        // Seeding only: the test pool's 5 s limit stays on for the run itself (stricter than the worker's 60 s).
        await tx.execute(sql`SET LOCAL statement_timeout = 0`);
        await tx.execute(sql`
          CREATE TEMP TABLE scale_m ON COMMIT DROP AS
          SELECT gen_random_uuid() AS id, gen_random_uuid() AS uid, s.shop_id,
                 (row_number() OVER ()) - 1 AS i
            FROM unnest(${`{${shopIds.join(",")}}`}::uuid[]) AS s(shop_id), generate_series(1, ${PER_SHOP}) g`);
        await tx.execute(sql`
          CREATE TEMP TABLE scale_p ON COMMIT DROP AS
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(patterns)}::jsonb)
                   AS x(p int, progress int, ingots int)`);
        await tx.execute(sql`
          INSERT INTO users (id, name, email, email_verified)
          SELECT uid, 'Scale member', 'scale-' || uid || '@test.moz.invalid', true FROM scale_m`);
        await tx.execute(sql`
          INSERT INTO memberships (id, user_id, shop_id, joined_at, progress_gold, ingots_completed,
                                   purchase_count, last_visit_at)
          SELECT m.id, m.uid, m.shop_id, ${joinedAt.toISOString()}, p.progress, p.ingots, p.p,
                 CASE WHEN p.p > 0 THEN ${joinedAt.toISOString()}::timestamptz + p.p * interval '1 minute' END
            FROM scale_m m JOIN scale_p p ON p.p = m.i % ${PATTERNS}`);
        await tx.execute(sql`
          CREATE TEMP TABLE scale_v ON COMMIT DROP AS
          SELECT m.id AS mid, m.uid, m.shop_id, k, gen_random_uuid() AS req, gen_random_uuid() AS rcpt,
                 gen_random_uuid() AS lid, ${joinedAt.toISOString()}::timestamptz + k * interval '1 minute' AS at
            FROM scale_m m, generate_series(1, (m.i % ${PATTERNS})::int) k`);
        await tx.execute(sql`
          INSERT INTO point_requests (id, membership_id, user_id, shop_id, status, idempotency_key,
                                      requested_at, decided_at, decided_by, award_gold, source)
          SELECT req, mid, uid, shop_id, 'approved', gen_random_uuid(), at, at, ${staffUser.id},
                 ${VISIT_GOLD}, 'request'
            FROM scale_v`);
        await tx.execute(sql`
          INSERT INTO receipts (id, shop_id, membership_id, request_id, number, data, created_by, created_at)
          SELECT rcpt, shop_id, mid, req, row_number() OVER (PARTITION BY shop_id ORDER BY at, req),
                 '{}'::jsonb, ${staffUser.id}, at
            FROM scale_v`);
        await tx.execute(sql`
          INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, program_version, request_id,
                                      receipt_id, idempotency_key, ref, created_by, created_at)
          SELECT lid, mid, shop_id, 'earn', ${VISIT_GOLD}, 1, req, rcpt, 'scale:' || lid, '{}'::jsonb,
                 ${staffUser.id}, at
            FROM scale_v`);
        // A reward per member with a full ingot; every other one redeemed (one 0-gold redeem row).
        await tx.execute(sql`
          CREATE TEMP TABLE scale_r ON COMMIT DROP AS
          SELECT gen_random_uuid() AS id, m.id AS mid, m.shop_id, m.i,
                 ${joinedAt.toISOString()}::timestamptz + interval '1 hour' AS at
            FROM scale_m m JOIN scale_p p ON p.p = m.i % ${PATTERNS} WHERE p.ingots > 0`);
        await tx.execute(sql`
          INSERT INTO rewards (id, membership_id, shop_id, kind, label, ingot_number, rewards_version,
                               unlocked_at, redeemed_at, expires_at)
          SELECT id, mid, shop_id, 'main', 'Free coffee', 1, 1, at,
                 CASE WHEN i % 2 = 0 THEN at + interval '1 minute' END, at + interval '90 days'
            FROM scale_r`);
        await tx.execute(sql`
          INSERT INTO ledger_entries (id, membership_id, shop_id, type, points, idempotency_key, ref,
                                      created_by, created_at)
          SELECT gen_random_uuid(), mid, shop_id, 'redeem', 0, 'scale:redeem:' || id,
                 jsonb_build_object('rewardId', id), ${staffUser.id}, at + interval '1 minute'
            FROM scale_r WHERE i % 2 = 0`);
      });
      // Production tables have autovacuum's statistics; a fresh bulk load has none until ANALYZE.
      for (const t of [
        "users",
        "memberships",
        "point_requests",
        "receipts",
        "ledger_entries",
        "rewards",
      ])
        await db().transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL statement_timeout = 0`);
          await tx.execute(sql.raw(`ANALYZE ${t}`));
        });
      const seedMs = Date.now() - seedStart;

      const counts = rowsOf(
        await db().execute(sql`
          SELECT (SELECT count(*) FROM memberships) AS memberships,
                 (SELECT count(*) FROM ledger_entries) AS ledger,
                 (SELECT count(*) FROM point_requests) AS requests,
                 (SELECT count(*) FROM rewards) AS rewards`),
      )[0];
      expect(Number(counts?.["memberships"])).toBeGreaterThanOrEqual(SHOPS * PER_SHOP);

      // The page query of reward_redeemed_twice, as `rowIssues` runs it (first page).
      const plan = rowsOf(
        await db().execute(sql`
          EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
          WITH page AS (SELECT id, shop_id FROM rewards WHERE id > '00000000-0000-0000-0000-000000000000'::uuid
                         ORDER BY id LIMIT ${INTEGRITY_BATCH.rows})
          SELECT p.id, p.shop_id, (SELECT count(*) FROM redemption_codes c WHERE c.reward_id = p.id
                                     AND c.status = 'confirmed') AS confirmed,
                 (SELECT count(*) FROM ledger_entries l WHERE l.type = 'redeem'
                    AND l.ref->>'rewardId' = p.id::text) AS redeems
            FROM page p ORDER BY p.id`),
      )
        .map((r) => String(r["QUERY PLAN"]))
        .join("\n");

      const redis = limiterRedis();
      const start = Date.now();
      const run = await runIntegrityCheck(JOBS, { redis });
      const runMs = Date.now() - start;
      const maxRunSec = SWEEPS["integrity-check"].maxRunSec;

      const report =
        `[C-110] seeded ${JSON.stringify(counts)} in ${(seedMs / 1000).toFixed(1)} s; ` +
        `integrity run ${(runMs / 1000).toFixed(1)} s (maxRunSec ${maxRunSec}); ` +
        `checked ${run.checkedMemberships}, issues ${run.issues}\n` +
        `[C-110] reward_redeemed_twice page plan:\n${plan}\n`;
      // Vitest hides a passing test's console: the evidence goes to .artifacts/ as well.
      mkdirSync(".artifacts", { recursive: true });
      writeFileSync(".artifacts/c-110-integrity-scale.txt", report);
      process.stderr.write(report);

      expect(plan).toContain("ledger_entries_redeem_reward_idx");
      expect(run.skipped).toBe(false);
      expect(run.checkedMemberships).toBeGreaterThanOrEqual(SHOPS * PER_SHOP);
      expect(run.issues).toBe(0);
      expect(runMs).toBeLessThan(maxRunSec * 1000);
    },
  );
});
