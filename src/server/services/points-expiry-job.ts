import "server-only";
import { points } from "@/lib/brand";
import { type MemberState, planExpiry } from "@/lib/loyalty/engine";
import { versionActiveAt } from "@/lib/loyalty/programme";
import type { SystemScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { notify } from "@/server/notifications/notify";
import { transaction } from "@/server/repos/_base";
import {
  type ExpiryCandidate,
  FIRST_KEY,
  forfeitLeftProgress,
  lockExpiryCandidates,
  programmeVersionsOf,
  recordExpiryWarning,
  sentWarningsOf,
  writeExpiry,
} from "@/server/repos/points-expiry";

/** Memberships per transaction, and the most pages one run works through (100,000 members a night). */
export const EXPIRY_BATCH = 200;
export const EXPIRY_MAX_BATCHES = 500;

export type PointsExpiryRun = {
  checked: number;
  warned30: number;
  warned7: number;
  expired: number;
  expiredGold: number;
  forfeited: number;
  forfeitedGold: number;
  /** A sweep stopped at EXPIRY_MAX_BATCHES with rows left (the rest waits for tomorrow; logged as a warning). */
  capped: boolean;
};

const stateOf = (m: ExpiryCandidate): MemberState => ({
  progress: points(m.progressGold),
  ingotsCompleted: m.ingotsCompleted,
  ingotStartedAt: m.ingotStartedAt ?? m.joinedAt,
  milestonesReached: m.milestonesReached,
  shortfall: points(m.goldShortfall),
  tier: m.tier,
  streak: { weeks: m.streakWeeks, lastWeekStart: m.streakLastWeekStart },
});

/**
 * Daily at 03:00 UK time (P1-13, PRODUCT §4, §6). Two keyset sweeps, each page in its own transaction:
 *
 * 1. Rolling expiry, for current members with current-ingot gold at a shop with expiry on (the setting of the
 *    version in force `now`): the engine's `planExpiry` decides per member: warn 30 or 7 days before (each sent
 *    once: the warning row and the notice commit together), or write the `expiry` ledger row and zero progress
 *    (once per expiry date: the ledger's idempotency key). Completed ingots, rewards, milestones, tier and any
 *    shortfall are never touched.
 * 2. Left memberships: frozen progress is forfeit from London day 31 after the leave (`apply_left_forfeit`, the
 *    same database code a late rejoin runs, C-73). No notice: they left the shop.
 *
 * Idempotent: a second run the same day (or a retry after a crash) changes nothing. `now` is injected
 * (ENGINEERING §8).
 */
export async function runPointsExpiry(
  scope: SystemScope,
  now: Date = new Date(),
  /** Page size (tests use a small one to cross page boundaries). */
  opts: { batch?: number } = {},
): Promise<PointsExpiryRun> {
  const batch = opts.batch ?? EXPIRY_BATCH;
  const run: PointsExpiryRun = {
    checked: 0,
    warned30: 0,
    warned7: 0,
    expired: 0,
    expiredGold: 0,
    forfeited: 0,
    forfeitedGold: 0,
    capped: false,
  };

  let after = FIRST_KEY;
  let batches = 0;
  for (;;) {
    if (batches++ === EXPIRY_MAX_BATCHES) {
      run.capped = true;
      break;
    }
    const page = await transaction(scope, async (tx) => {
      const rows = await lockExpiryCandidates(scope, tx, after, batch);
      const versions = await programmeVersionsOf(scope, tx, [
        ...new Set(rows.map((r) => r.shopId)),
      ]);
      const sent = await sentWarningsOf(
        scope,
        tx,
        rows.map((r) => r.id),
      );
      for (const m of rows) {
        const shopVersions = versions.get(m.shopId) ?? [];
        const step = planExpiry(stateOf(m), shopVersions, m.lastVisitAt, now, sent.get(m.id) ?? []);
        if (step.kind === "warn") {
          const fresh = await recordExpiryWarning(scope, tx, {
            membershipId: m.id,
            expiresAt: step.nominalExpiresAt,
            daysBefore: step.daysBefore,
            sentAt: now,
          });
          if (!fresh) continue;
          await notify(scope, tx, [m.userId], {
            type: "points_expiry_warning",
            shopId: m.shopId,
            payload: {
              shopId: m.shopId,
              gold: step.gold,
              expiresAt: step.expiresAt.toISOString(),
              daysBefore: step.daysBefore,
            },
          });
          if (step.daysBefore === 30) run.warned30++;
          else run.warned7++;
        } else if (step.kind === "due") {
          const written = await writeExpiry(scope, tx, {
            membershipId: m.id,
            shopId: m.shopId,
            gold: step.gold,
            nominalExpiresAt: step.nominalExpiresAt,
            programVersion: versionActiveAt(shopVersions, now)?.version ?? null,
          });
          if (written) {
            run.expired++;
            run.expiredGold += step.gold;
          }
        }
      }
      return rows;
    });
    run.checked += page.length;
    const last = page.at(-1);
    if (!last || page.length < batch) break;
    after = last.id;
  }

  after = FIRST_KEY;
  batches = 0;
  for (;;) {
    if (batches++ === EXPIRY_MAX_BATCHES) {
      run.capped = true;
      break;
    }
    const page = await transaction(scope, (tx) =>
      forfeitLeftProgress(scope, tx, after, batch, now),
    );
    for (const f of page) {
      if (f.gold > 0) {
        run.forfeited++;
        run.forfeitedGold += f.gold;
      }
    }
    const last = page.at(-1);
    if (!last || page.length < batch) break;
    after = last.id;
  }

  if (run.capped)
    log().warn({ run }, "points-expiry: stopped at the batch cap; the rest runs tomorrow");
  return run;
}
