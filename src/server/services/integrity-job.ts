import "server-only";
import { randomUUID } from "node:crypto";
import type { ProgrammeVersion } from "@/lib/loyalty/programme";
import { replayLedger } from "@/lib/loyalty/replay";
import type { SystemScope } from "@/server/authz/scope";
import type { IntegrityCheck } from "@/server/db/schema";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { captureIntegrityIssues } from "@/server/observability/sentry";
import {
  counterPage,
  FIRST_KEY,
  type FoundIssue,
  receiptNumberIssues,
  recordIssues,
  rowIssues,
  versionsOf,
} from "@/server/repos/integrity";
import { opsAlert } from "@/server/security/alert";
import { limiterRedis } from "@/server/security/rate-limit";
import type { Redis } from "ioredis";

/**
 * Data-integrity reconciliation (P1-17; TESTING §10; ARCHITECTURE §4, §6). Nightly at 04:00 UK time, or when an
 * admin asks. Read-only: it compares and records, never "fixes". Checks:
 * - membership_counters: each membership's ledger, replayed through the loyalty engine, gives the cached
 *   progress and ingots completed, and progress is never below 0;
 * - receipt_numbers: per shop, 1..n with no gap and no repeat;
 * - reward_redeemed_twice, redeem_not_zero (every `redeem` row is 0 gold);
 * - request_approved_twice, approved_without_ledger, approved_without_receipt (15 min after approval).
 * Mismatches go to `integrity_issues` (one open row per check and entity; `detected_at` kept; resolved when a
 * later run no longer finds it), Sentry and the developers' ops alert (new ones only). One run at a time: a run
 * that finds another in progress skips with a log line. Keyset pages throughout; `timedSweep` alarms a slow or
 * missed run.
 */
export const INTEGRITY_BATCH = { members: 500, rows: 2_000 } as const;
/** The lock outlives any healthy run (the sweep alarm is at 15 min) and frees itself if a worker dies. */
const LOCK_MS = 30 * 60_000;

export type IntegrityRun = {
  skipped: boolean;
  checkedMemberships: number;
  issues: number;
  newIssues: number;
};

const ROW_CHECKS = [
  "reward_redeemed_twice",
  "redeem_not_zero",
  "request_approved_twice",
  "approved_without_ledger",
  "approved_without_receipt",
] as const satisfies readonly IntegrityCheck[];

const lockKey = (): string => `${env().REDIS_KEY_PREFIX}lock:integrity-check`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

async function counterIssues(
  scope: SystemScope,
  batch: number,
): Promise<{ issues: FoundIssue[]; checked: number }> {
  const issues: FoundIssue[] = [];
  const versions = new Map<string, ProgrammeVersion[]>();
  let after = FIRST_KEY;
  let checked = 0;
  for (;;) {
    const page = await counterPage(scope, after, batch);
    if (page.members.length === 0) break;
    const missing = [...new Set(page.members.map((m) => m.shopId))].filter(
      (id) => !versions.has(id),
    );
    for (const [shopId, list] of await versionsOf(scope, missing)) versions.set(shopId, list);
    for (const id of missing) if (!versions.has(id)) versions.set(id, []);
    for (const m of page.members) {
      const expected = replayLedger({
        joinedAt: m.joinedAt,
        versions: versions.get(m.shopId) ?? [],
        rows: page.ledger.get(m.id) ?? [],
      });
      if (
        m.progressGold < 0 ||
        expected.progress !== m.progressGold ||
        expected.ingotsCompleted !== m.ingotsCompleted
      ) {
        issues.push({
          check: "membership_counters",
          entity: "memberships",
          entityId: m.id,
          shopId: m.shopId,
          details: {
            progress: m.progressGold,
            ledgerProgress: expected.progress,
            ingots: m.ingotsCompleted,
            ledgerIngots: expected.ingotsCompleted,
          },
        });
      }
    }
    checked += page.members.length;
    const last = page.members[page.members.length - 1];
    if (!last || page.members.length < batch) break;
    after = last.id;
  }
  return { issues, checked };
}

async function pagedIssues(
  run: (after: string) => Promise<{ issues: FoundIssue[]; last: string | null }>,
): Promise<FoundIssue[]> {
  const issues: FoundIssue[] = [];
  let after: string | null = FIRST_KEY;
  while (after !== null) {
    const page = await run(after);
    issues.push(...page.issues);
    after = page.last;
  }
  return issues;
}

export async function runIntegrityCheck(
  scope: SystemScope,
  opts: {
    redis?: Redis;
    /** Tests only: small pages prove the keyset paging. */ batch?: {
      members: number;
      rows: number;
    };
  } = {},
): Promise<IntegrityRun> {
  const batch = opts.batch ?? INTEGRITY_BATCH;
  const redis = opts.redis ?? limiterRedis();
  const token = randomUUID();
  const got = await redis.set(lockKey(), token, "PX", LOCK_MS, "NX");
  if (got !== "OK") {
    log().info({ job: "integrity-check" }, "integrity check skipped: another run is in progress");
    return { skipped: true, checkedMemberships: 0, issues: 0, newIssues: 0 };
  }
  try {
    const found = new Map<IntegrityCheck, FoundIssue[]>();
    const counters = await counterIssues(scope, batch.members);
    found.set("membership_counters", counters.issues);
    found.set(
      "receipt_numbers",
      await pagedIssues((after) => receiptNumberIssues(scope, after, batch.rows)),
    );
    for (const check of ROW_CHECKS)
      found.set(check, await pagedIssues((after) => rowIssues(scope, check, after, batch.rows)));

    let total = 0;
    const fresh: Record<string, number> = {};
    for (const [check, issues] of found) {
      total += issues.length;
      const added = await recordIssues(scope, check, issues);
      if (added.length > 0) fresh[check] = added.length;
    }
    const newIssues = Object.values(fresh).reduce((a, b) => a + b, 0);
    if (newIssues > 0) {
      opsAlert("integrity.issue", { new: newIssues, open: total, ...fresh });
      captureIntegrityIssues(fresh);
    }
    return { skipped: false, checkedMemberships: counters.checked, issues: total, newIssues };
  } finally {
    await redis.eval(RELEASE, 1, lockKey(), token).catch((err: unknown) => {
      log().error({ err }, "integrity check lock release failed");
    });
  }
}
