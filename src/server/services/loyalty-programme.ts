import "server-only";
import {
  describeChanges,
  type ProgrammeRules,
  rewardsFromFor,
  sameRules,
} from "@/lib/loyalty/programme";
import type { ShopScope } from "@/server/authz/scope";
import type { Transaction } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { writeOutbox } from "@/server/jobs/outbox";
import {
  insertProgrammeVersion,
  listProgrammeVersions,
  lockProgrammeSaves,
} from "@/server/repos/loyalty";

export const STALE_PROGRAMME =
  "The programme was changed in another tab or by another owner. Reload the page to see the latest version.";

export type SaveProgrammeResult =
  | { kind: "unchanged"; version: number }
  | {
      kind: "saved";
      version: number;
      /** When the main reward and milestones apply; later than `activeFrom` when members get notice. */
      rewardsFrom: Date;
      activeFrom: Date;
      changes: string[];
    };

/**
 * Saves the owner's settings as a new immutable version (P1-05, PRODUCT §6). Nothing else is written: members'
 * progress, ledger and rewards are untouched, and each member's current ingot keeps the terms it started under
 * (`ingotTerms`). `baseVersion` is the version the form was opened on; any other latest version means the form
 * is stale and nothing is saved. Saving identical rules creates no version. `now` is injectable for tests.
 *
 * The 14-day notice to members (PRODUCT §6, C-58): when the main reward or milestones change (`rewardsFrom` is
 * later than `activeFrom`), a `loyalty-change-notice` job is written in this same transaction; its handler gives
 * every current member one in-app notice (src/server/notifications/loyalty-notice.ts). A rolled-back save
 * writes nothing.
 */
export async function saveProgramme(
  scope: ShopScope,
  input: { baseVersion: number; rules: ProgrammeRules },
  tx: Transaction,
  now: Date = new Date(),
): Promise<SaveProgrammeResult> {
  // Defence in depth: the action's policy already requires the owner role, and RLS refuses staff inserts.
  if (scope.role !== "owner") throw new AppError("FORBIDDEN");
  await lockProgrammeSaves(scope, tx);
  const versions = await listProgrammeVersions(scope, tx);
  const latest = versions.at(-1) ?? null;
  if ((latest?.version ?? 0) !== input.baseVersion) throw new AppError("CONFLICT", STALE_PROGRAMME);
  if (latest && sameRules(latest, input.rules))
    return { kind: "unchanged", version: latest.version };

  // Versions are ordered in time too: a host whose clock lags never dates a version before the previous one.
  const activeFrom =
    latest && latest.activeFrom.getTime() > now.getTime() ? latest.activeFrom : now;
  const rewardsFrom = rewardsFromFor(versions, input.rules, activeFrom);
  const saved = await insertProgrammeVersion(scope, tx, {
    version: (latest?.version ?? 0) + 1,
    rules: input.rules,
    activeFrom,
    rewardsFrom,
  });
  if (saved.rewardsFrom.getTime() > saved.activeFrom.getTime()) {
    await writeOutbox(scope, tx, "notifications", "loyalty-change-notice", {
      shopId: scope.shopId,
      version: saved.version,
      savedAt: now.toISOString(),
    });
  }
  return {
    kind: "saved",
    version: saved.version,
    activeFrom: saved.activeFrom,
    rewardsFrom: saved.rewardsFrom,
    changes: describeChanges(latest, input.rules),
  };
}
