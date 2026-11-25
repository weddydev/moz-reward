import "server-only";
import { type WalletView, walletView } from "@/features/wallet/view";
import { londonDate } from "@/lib/time";
import type { CustomerScope } from "@/server/authz/scope";
import { readOwnWallet } from "@/server/repos/wallet";

/**
 * The customer's Wallet (P1-07): one scoped read (a fixed number of statements, `readOwnWallet`), then the pure
 * view (`walletView`: engine progress, labels, sort order, summary). Rewards ready, recent activity and each
 * membership's award history behind "N more visits" come from the rewards and ledger tables (P1-12, C-62).
 */
export async function loadWallet(scope: CustomerScope, now: Date): Promise<WalletView> {
  const read = await readOwnWallet(scope, londonDate(now));
  const inputs = read.memberships.map((m) => ({
    ...m,
    versions: read.programmes.get(m.shopId) ?? [],
    hours: read.hours.get(m.shopId) ?? [],
    closures: read.closures.get(m.shopId) ?? [],
    recentAwards: read.recentAwards.get(m.membershipId) ?? [],
  }));
  return walletView(inputs, read.rewardsReady, now, read.activity);
}
