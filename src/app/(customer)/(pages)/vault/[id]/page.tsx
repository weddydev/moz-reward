import { PortalNotFound } from "@/features/portal/StatePage";
import { readyRewardView } from "@/features/rewards/view";
import { VaultPage } from "@/features/vault/VaultPage";
import { vaultView } from "@/features/vault/view";
import { requireCustomer } from "@/server/authz";
import { gateCustomerRoute } from "@/server/portal/gate";
import { readOwnReadyRewards } from "@/server/repos/redemptions";
import { readOwnVault } from "@/server/repos/vault";
import type { Metadata } from "next";

/**
 * The customer's Gold Vault at one shop `/vault/[id]` (P1-08, PRODUCT §6, DESIGN §15 screen 5). Members only,
 * like `/shops/[id]`: anyone else (never joined, left, a malformed or unknown id) gets the same 404, so the
 * page never confirms that a shop id exists. The not-found page is rendered here, not thrown: under the
 * group's `loading.tsx` a `notFound()` after the fallback has streamed is React error #419 in the browser
 * (DECISIONS 19 Nov "Member pages render their not-found").
 */
type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Gold Vault", robots: { index: false, follow: false } };

export default async function VaultRoute({
  params,
}: {
  params: Params;
}): Promise<React.JSX.Element> {
  const principal = await gateCustomerRoute("/vault/[id]");
  const { id } = await params;
  if (!UUID.test(id)) return <PortalNotFound portal="customer" />;
  const scope = await requireCustomer(principal);
  const now = new Date();
  const [vault, ready] = await Promise.all([
    readOwnVault(scope, id.toLowerCase()),
    readOwnReadyRewards(scope, { shopId: id.toLowerCase(), now }),
  ]);
  if (!vault) return <PortalNotFound portal="customer" />;
  return (
    <VaultPage
      shop={{ shopId: vault.shopId, name: vault.name, logoUrl: vault.logoUrl }}
      view={vaultView(vault, now)}
      rewards={ready.map(readyRewardView)}
    />
  );
}
