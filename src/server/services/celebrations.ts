import "server-only";
import { type Celebration, receiptView } from "@/lib/celebration";
import { ingotTerms, versionActiveAt } from "@/lib/loyalty/programme";
import type { CustomerScope } from "@/server/authz/scope";
import { claimOwnCelebration } from "@/server/repos/celebrations";
import { readOwnVault } from "@/server/repos/vault";

/**
 * P1-15: the signed-in customer's next "points credited" moment, or null (DESIGN §8.2). Claiming marks it seen
 * on the server first, so it is shown once, in one tab, even when the stream and an app open race. The ingot
 * levels are the approval's own snapshot (not today's counters, which later gold may have moved); the reward
 * the ingot was for comes from the unlocked reward, or the programme in force, and the visit estimate from the
 * rules in force now (what the next visit would earn).
 */
export async function claimCelebration(
  scope: CustomerScope,
  now = new Date(),
): Promise<Celebration | null> {
  const claimed = await claimOwnCelebration(scope, now);
  if (!claimed) return null;
  const { approval, receipt, rewards } = claimed;
  const vault = await readOwnVault(scope, approval.shopId);
  if (!vault) return null; // left the shop between the claim and this read: nothing to celebrate there

  const current = versionActiveAt(vault.versions, now);
  const terms = ingotTerms(vault.versions, vault.ingotStartedAt ?? vault.joinedAt);
  const main = rewards.find((r) => r.kind === "main");
  const filled = rewards.filter((r) => r.kind === "main").length;
  return {
    requestId: approval.id,
    shop: { id: vault.shopId, name: vault.name, logoUrl: vault.logoUrl, code: vault.shopCode },
    gold: approval.gold,
    amountPence: approval.amountPence,
    ingot: {
      from: approval.progressBefore,
      to: approval.progressAfter,
      size: approval.ingotSize,
      ingotsBefore: Math.max(0, vault.ingotsCompleted - filled),
      filled,
    },
    title: main?.label ?? terms?.mainReward.text ?? "Your reward",
    perVisit: current?.earnMode === "per_visit" ? current.earnRate : null,
    rewards,
    receipt: receipt ? receiptView(receipt) : null,
  };
}
