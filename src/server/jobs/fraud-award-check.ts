import "server-only";
import { sharedDeviceSessions } from "@/server/auth/device-signal";
import { systemScope, type TenantScope } from "@/server/authz/scope";
import { log } from "@/server/log";
import { transaction } from "@/server/repos/_base";
import { readAwardParties, recordFraudFlag } from "@/server/repos/fraud";
import { audit } from "@/server/services/audit";

/** The rule's name in fraud_flags (the P4-08 monitor lists flags by rule). */
export const AWARD_SAME_DEVICE = "award_same_device";

/** moz_worker's insert into fraud_flags, after the approver's own scope has read the award. */
const FLAG_SCOPE = systemScope("worker: record a fraud rule hit for an award");

type AwardParty = "approver" | "router";

export type AwardCheckResult =
  { receiptId: string; flagged: boolean } | { receiptId: string; skipped: "not-visible" };

/**
 * `fraud:award-check` (P1-12, PRODUCT §5 and §16): an award to a customer account seen on the approver's device
 * stands, but raises a flag for the fraud monitor. "Seen on the same device" = the approver (or, for an award
 * routed to the owner, the staff member who routed it) and the customer each have a session active in the last
 * 30 days with the same IP address and user agent (identity layer; only a count comes back). Runs under the
 * approving team member's scope, so it checks only an award that scope can still see; a deactivated approver,
 * another shop or a non-team scope ends the job without a retry. Idempotent: one flag (and one audit row) per
 * receipt however often it runs.
 */
export async function checkAwardDevice(
  ids: { receiptId: string; requestId: string },
  scope: TenantScope,
): Promise<AwardCheckResult> {
  const { receiptId } = ids;
  const parties = scope.kind === "shop" ? await readAwardParties(scope, ids) : null;
  if (!parties) {
    log().info(
      { receiptId, scope: scope.kind },
      "award check skipped: not visible to its producer",
    );
    return { receiptId, skipped: "not-visible" };
  }
  // A routed award has two team members behind it: the one who routed it (the likely colluder) and the owner.
  const checked: { party: AwardParty; userId: string }[] = [
    { party: "approver", userId: parties.approverId },
  ];
  if (parties.routerId && parties.routerId !== parties.approverId) {
    checked.push({ party: "router", userId: parties.routerId });
  }
  const hits: { party: AwardParty; matches: number }[] = [];
  for (const { party, userId } of checked) {
    const matches = await sharedDeviceSessions(userId, parties.customerId);
    if (matches > 0) hits.push({ party, matches });
  }
  if (hits.length === 0) return { receiptId, flagged: false };

  const details = {
    shopId: parties.shopId,
    requestId: parties.requestId,
    membershipId: parties.membershipId,
    signal: "ip+ua",
    party: hits.map((h) => h.party).join("+"),
    matches: hits.reduce((n, h) => n + h.matches, 0),
  };
  const created = await transaction(FLAG_SCOPE, async (tx) => {
    const isNew = await recordFraudFlag(
      FLAG_SCOPE,
      { rule: AWARD_SAME_DEVICE, entity: "receipt", entityId: receiptId, details },
      tx,
    );
    if (isNew) {
      await audit(tx, {
        actor: FLAG_SCOPE,
        action: "fraud_flag.raise",
        entity: "receipt",
        entityId: receiptId,
        meta: { rule: AWARD_SAME_DEVICE, shopId: parties.shopId, party: details.party },
      });
    }
    return isNew;
  });
  log().warn(
    { receiptId, shopId: parties.shopId, rule: AWARD_SAME_DEVICE, party: details.party, created },
    "fraud flag: award to an account seen on a team member's device",
  );
  return { receiptId, flagged: true };
}
