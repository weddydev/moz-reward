import { firstNameOf, greeting } from "@/features/wallet/view";
import { WalletPage } from "@/features/wallet/WalletPage";
import { requireCustomer } from "@/server/authz";
import { gateCustomerRoute } from "@/server/portal/gate";
import { ownMemberCard } from "@/server/repos/profiles";
import { loadWallet } from "@/server/services/wallet";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Wallet" };

/**
 * The customer's Wallet `/wallet` (P1-07): their own memberships only (customer scope + RLS). Rendered per
 * request: progress changes with every approval, and pull-to-refresh re-renders it on the server.
 */
export default async function Wallet(): Promise<React.JSX.Element> {
  const principal = await gateCustomerRoute("/wallet");
  const scope = await requireCustomer(principal);
  const now = new Date();
  const [view, profile] = await Promise.all([loadWallet(scope, now), ownMemberCard(scope)]);
  return <WalletPage view={view} greeting={greeting(now, firstNameOf(profile?.fullName))} />;
}
