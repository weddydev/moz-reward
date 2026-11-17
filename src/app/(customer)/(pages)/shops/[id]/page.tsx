import { notFound } from "next/navigation";
import { MemberShopPage } from "@/features/shop/MemberShopPage";
import { requireCustomer } from "@/server/authz";
import { gateCustomerRoute } from "@/server/portal/gate";
import { readOwnMemberShop } from "@/server/repos/memberships";
import { ownMemberCard } from "@/server/repos/profiles";
import type { Metadata } from "next";

/**
 * The customer's shop page `/shops/[id]` (P1-04 minimal; P1-09 builds screen 4 on it). Members only: anyone
 * else (never joined, left, staff or admin without a membership, a malformed or unknown id) gets the same 404,
 * so the page never confirms that a shop id exists. `?welcome=1` (set by the join sheet) shows the first-join
 * welcome; it only changes copy on the caller's own page.
 */
type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Shop", robots: { index: false, follow: false } };

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const principal = await gateCustomerRoute("/shops/[id]");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const scope = await requireCustomer(principal);
  const [shop, member] = await Promise.all([
    readOwnMemberShop(scope, id.toLowerCase()),
    ownMemberCard(scope),
  ]);
  if (!shop || !member) notFound();
  const welcome = (await searchParams).welcome === "1";
  return <MemberShopPage shop={shop} member={member} welcome={welcome} />;
}
