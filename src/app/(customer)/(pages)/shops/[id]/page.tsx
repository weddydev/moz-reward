import { MARKETING_CONSENT_VERSION, marketingConsentParts } from "@/features/join/consent";
import { JoinCta } from "@/features/join/JoinCta";
import { PortalNotFound } from "@/features/portal/StatePage";
import { MemberShopPage } from "@/features/shop/MemberShopPage";
import { receiptRow } from "@/features/shop/view";
import { vaultView } from "@/features/vault/view";
import { parseShopId } from "@/lib/brand";
import { requireCustomer } from "@/server/authz";
import { gateCustomerRoute } from "@/server/portal/gate";
import { readOwnMemberShop } from "@/server/repos/memberships";
import { readOwnOpenRequest } from "@/server/repos/point-requests";
import { ownMemberCard } from "@/server/repos/profiles";
import { readOwnReceipts } from "@/server/repos/receipts";
import { findJoinableShopCode } from "@/server/repos/shops";
import { readOwnVault } from "@/server/repos/vault";
import { loadShopLanding } from "@/server/services/shop-landing";
import type { Metadata } from "next";

/**
 * The customer's shop page `/shops/[id]` (screen 4, P1-09). A current member gets the full page. A signed-in
 * non-member (never joined, or left) of a shop that is taking members gets its public sections with the join
 * CTA instead of the member sections (DECISIONS 19 Nov). Everyone else (a malformed or unknown id, a pending,
 * suspended or closed shop they aren't in) gets the same not-found page. Rendered here, not thrown: a
 * `notFound()` after the loading fallback has streamed is React error #419 in the browser (DECISIONS 19 Nov).
 * `?welcome=1` (set by the join sheet) shows the first-join welcome; it only changes copy on the caller's own
 * page. The shop's public profile comes from the cached landing data (60 s), as on `/s/[code]`.
 */
type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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
  const shopId = parseShopId(id);
  if (!shopId) return <PortalNotFound portal="customer" />;
  const scope = await requireCustomer(principal);
  const [shop, member, vault, open, receipts] = await Promise.all([
    readOwnMemberShop(scope, shopId),
    ownMemberCard(scope),
    readOwnVault(scope, shopId),
    readOwnOpenRequest(scope, shopId),
    readOwnReceipts(scope, shopId),
  ]);
  const now = new Date();

  if (shop) {
    if (!member) return <PortalNotFound portal="customer" />;
    const landing = await loadShopLanding(shop.shopCode);
    const vaultData = vault ? vaultView(vault, now) : null;
    // P1-11: the button shows where the server would take a request (live shop, programme in force); an open
    // request shows its pending state wherever it is, until it is decided, expires or the member leaves.
    const takesRequests = landing.kind === "live" && vaultData !== null;
    const openView =
      open && (open.status === "pending" || open.status === "awaiting_owner")
        ? { status: open.status, requestedAt: open.requestedAt.toISOString() }
        : null;
    return (
      <MemberShopPage
        shop={{ shopId, name: shop.name, logoUrl: shop.logoUrl, muted: shop.muted }}
        details={landing.kind === "live" ? landing : null}
        availability={landing.kind === "gone" ? landing.status : "live"}
        member={member}
        vault={vaultData}
        welcome={(await searchParams).welcome === "1"}
        request={openView || takesRequests ? { open: openView, userId: scope.userId } : null}
        receipts={receipts.map(receiptRow)}
        now={now}
      />
    );
  }

  const code = await findJoinableShopCode(scope, shopId);
  const landing = code ? await loadShopLanding(code) : null;
  if (!code || landing?.kind !== "live") return <PortalNotFound portal="customer" />;
  const name = landing.shop.name;
  return (
    <MemberShopPage
      shop={{ shopId, name, logoUrl: landing.shop.logoUrl, muted: false }}
      details={landing}
      member={null}
      vault={null}
      welcome={false}
      join={
        <JoinCta
          shopCode={code}
          shopName={name}
          needsProfile={!member}
          consent={{
            version: MARKETING_CONSENT_VERSION,
            ...marketingConsentParts(name),
            shopName: name,
          }}
          autoOpen={false}
        />
      }
      now={now}
    />
  );
}
