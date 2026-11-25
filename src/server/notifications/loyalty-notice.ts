import "server-only";
import type { TenantScope } from "@/server/authz/scope";
import { transaction } from "@/server/repos/_base";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import { currentMemberPage } from "@/server/repos/notifications";
import { opsAlert } from "@/server/security/alert";
import { notify } from "./notify";

/** Members notified per transaction (one `notify` call, one realtime hint). */
export const NOTICE_PAGE = 100;

export type LoyaltyNoticeResult = { sent: number } | { sent: 0; unreadable: true };

/**
 * C-58 (PRODUCT §6): after a programme save whose rewards or milestones change, every **current** member of the
 * shop gets one in-app notice with the date the new rewards apply. Runs as the saving owner's shop scope (C-30),
 * so RLS still applies. Keyset-paged over members (left members excluded); each notice's id is derived from
 * (shop, version, member) and its time is the save time, so a retried job inserts nothing twice.
 * If the version can't be read (the owner lost the role before the job ran, RLS hides it), nothing is sent and
 * an ops alert says so, distinct from "no members" (DECISIONS 25 Nov).
 */
export async function sendLoyaltyChangeNotices(
  payload: { shopId: string; version: number; savedAt: string },
  scope: TenantScope,
): Promise<LoyaltyNoticeResult> {
  if (scope.kind !== "shop" || scope.shopId !== payload.shopId) {
    throw new Error("loyalty-change-notice: the job's scope is not the shop it names");
  }
  const version = (await listProgrammeVersions(scope)).find((v) => v.version === payload.version);
  if (!version) {
    opsAlert("notifications.undelivered", {
      job: "loyalty-change-notice",
      shopId: payload.shopId,
      version: payload.version,
    });
    return { sent: 0, unreadable: true };
  }
  const notice = {
    type: "loyalty_change_notice" as const,
    shopId: payload.shopId,
    payload: {
      shopId: payload.shopId,
      version: payload.version,
      rewardsFrom: version.rewardsFrom.toISOString(),
    },
    dedupe: {
      key: `loyalty-change:${payload.shopId}:${String(payload.version)}`,
      createdAt: new Date(payload.savedAt),
    },
  };
  let after: string | null = null;
  let sent = 0;
  for (;;) {
    const page: string[] = await transaction(scope, async (tx) => {
      const ids = await currentMemberPage(scope, tx, after, NOTICE_PAGE);
      await notify(scope, tx, ids, notice);
      return ids;
    });
    sent += page.length;
    if (page.length < NOTICE_PAGE) return { sent };
    after = page.at(-1) ?? null;
  }
}
