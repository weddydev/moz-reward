"use server";

import { defineAction } from "@/server/actionTemplate";
import { requireShopRole } from "@/server/authz";
import { ownShopCode } from "@/server/repos/loyalty";
import { saveProgramme } from "@/server/services/loyalty-programme";
import { invalidateShopLanding } from "@/server/services/shop-landing";
import { saveProgrammeInput } from "./programme-input";

export type SaveLoyaltyResult =
  | { kind: "unchanged"; version: number }
  | { kind: "saved"; version: number; activeFrom: string; rewardsFrom: string; changes: string[] };

/**
 * Loyalty programme → Save (P1-05, PRODUCT §6, §14). Owner of the shop only (staff get 403 on the page and
 * FORBIDDEN here; RLS refuses their insert). Strict input; appends one immutable version in one transaction
 * with its audit row. Fails closed when Redis is down: the programme decides what members earn. The settings
 * page is dynamic; the form refreshes it after a save. A saved version drops the shop's cached landing page
 * after commit, so its reward preview (C-50) is never staler than the save.
 */
export const saveLoyaltyProgramme = defineAction({
  name: "loyalty.save",
  input: saveProgrammeInput,
  authorize: ({ shopId }, p) => requireShopRole(shopId, ["owner"], p),
  rateLimit: { max: 30, windowSec: 60 * 60, failMode: "closed" },
  audit: ({ shopId }, _scope, result: SaveLoyaltyResult) =>
    result.kind === "saved"
      ? {
          action: "loyalty_programme.save",
          entity: "shop",
          entityId: shopId,
          meta: { version: result.version, rewardsFrom: result.rewardsFrom },
        }
      : null,
  handler: async (
    { baseVersion, rules },
    scope,
    { tx, afterCommit },
  ): Promise<SaveLoyaltyResult> => {
    if (!tx) throw new Error("loyalty.save runs in a transaction");
    const result = await saveProgramme(scope, { baseVersion, rules }, tx);
    if (result.kind === "unchanged") return result;
    const shopCode = await ownShopCode(scope, tx);
    if (shopCode) afterCommit(() => invalidateShopLanding(shopCode));
    return {
      kind: "saved",
      version: result.version,
      activeFrom: result.activeFrom.toISOString(),
      rewardsFrom: result.rewardsFrom.toISOString(),
      changes: result.changes,
    };
  },
});
