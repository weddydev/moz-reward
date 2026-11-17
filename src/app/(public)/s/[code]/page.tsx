import { Store } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LandingFooter, ShopLanding } from "@/features/landing/ShopLanding";
import { StatePage } from "@/features/portal/StatePage";
import { normaliseCode, SHOP_CODE_LENGTH } from "@/lib/codes";
import { requireCustomer } from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import { env } from "@/server/env";
import { isOwnMember } from "@/server/repos/memberships";
import type { ShopLandingData } from "@/server/repos/shops";
import { loadShopLanding } from "@/server/services/shop-landing";
import type { Metadata } from "next";

/**
 * Shop landing `/s/[code]` (P1-02, PRODUCT §3, DESIGN §15 screen 1). Rendered per request with the nonce CSP
 * (ARCHITECTURE §5); the proxy has already applied the per-IP lookup limit and `Cache-Control: private,
 * no-store`. Public shop data comes from redis-cache (60 s); whether the visitor is a member is read here,
 * per request, and never cached. `?src=qr|nfc|code` is for analytics and the entry animation (P1-03) only.
 */
type Params = Promise<{ code: string }>;

async function landing(raw: string): Promise<{ code: string | null; data: ShopLandingData }> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return { code: null, data: { kind: "none" } }; // a malformed escape is just an unknown code
  }
  const code = normaliseCode(decoded, SHOP_CODE_LENGTH);
  return { code, data: code ? await loadShopLanding(code) : { kind: "none" } };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await connection();
  const { code, data } = await landing((await params).code);
  if (!code || data.kind === "none") return { title: "Shop not found", robots: { index: false } };
  if (data.kind === "gone") return { title: data.name, robots: { index: false, follow: false } };
  const { shop } = data;
  const url = `${env().APP_URL}/s/${code}`;
  const description =
    shop.description?.slice(0, 160) ??
    `Collect gold and unlock rewards at ${shop.name} with Moz Rewards.`;
  return {
    title: shop.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: shop.name,
      description,
      url,
      type: "website",
      ...(shop.coverUrl ? { images: [{ url: shop.coverUrl }] } : {}),
    },
  };
}

/** Whether the signed-in visitor (if any) is a member: staff and admins and anonymous visitors are not. */
async function visitorIsMember(shopId: string): Promise<{ signedIn: boolean; member: boolean }> {
  const principal = await currentPrincipal();
  if (!principal) return { signedIn: false, member: false };
  try {
    return { signedIn: true, member: await isOwnMember(await requireCustomer(principal), shopId) };
  } catch {
    return { signedIn: true, member: false };
  }
}

export default async function ShopLandingPage({
  params,
}: {
  params: Params;
}): Promise<React.JSX.Element> {
  await connection();
  const { code, data } = await landing((await params).code);
  if (!code || data.kind === "none") notFound();

  if (data.kind === "gone") {
    const suspended = data.status === "suspended";
    return (
      <>
        <StatePage
          as="main"
          page={suspended ? "shop-suspended" : "shop-closed"}
          icon={Store}
          title={suspended ? `${data.name} is taking a break` : data.name}
          message={
            suspended
              ? "This shop isn't collecting points on Moz Rewards right now. Please check back soon."
              : "This shop is no longer on Moz Rewards."
          }
          action={{ href: "/wallet", label: "Go to my wallet" }}
        />
        <LandingFooter />
      </>
    );
  }

  const visitor = await visitorIsMember(data.shop.id);
  // P1-04 replaces these targets with the join sheet (CARRIED C-52).
  const collectHref = visitor.signedIn
    ? "/wallet"
    : `/sign-in?returnTo=${encodeURIComponent(`/s/${code}`)}`;
  return (
    <ShopLanding data={data} collectHref={collectHref} member={visitor.member} now={new Date()} />
  );
}
