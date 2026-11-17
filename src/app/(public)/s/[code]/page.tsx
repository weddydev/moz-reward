import { Store } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { GildedGate, GildedGateMorph } from "@/components/motion/GildedGate";
import { buttonClasses } from "@/components/ui/Button";
import { MARKETING_CONSENT_VERSION, marketingConsentText } from "@/features/join/consent";
import { JoinSheet } from "@/features/join/JoinSheet";
import { LandingFooter, ShopLanding } from "@/features/landing/ShopLanding";
import { StatePage } from "@/features/portal/StatePage";
import { normaliseCode, SHOP_CODE_LENGTH } from "@/lib/codes";
import { gateEntrySource } from "@/lib/motion/gilded-gate";
import { requireCustomer } from "@/server/authz";
import { currentPrincipal } from "@/server/authz/principal";
import { env } from "@/server/env";
import { isOwnMember } from "@/server/repos/memberships";
import { ownMemberId } from "@/server/repos/profiles";
import type { ShopLandingData } from "@/server/repos/shops";
import { loadShopLanding } from "@/server/services/shop-landing";
import type { Metadata } from "next";

/**
 * Shop landing `/s/[code]` (P1-02, PRODUCT §3, DESIGN §15 screen 1). Rendered per request with the nonce CSP
 * (ARCHITECTURE §5); the proxy has already applied the per-IP lookup limit and `Cache-Control: private,
 * no-store`. Public shop data comes from redis-cache (60 s); whether the visitor is a member is read here,
 * per request, and never cached. `?src=qr|nfc|code` is for analytics and the entry animation only: `qr`/`nfc`
 * render the Gilded Gate (P1-03), which plays once per shop per browser session.
 */
type Params = Promise<{ code: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

type Visitor =
  | { kind: "signed-out" }
  | { kind: "member" }
  /** Signed in, not a member (never joined, or left): the join sheet; first join also asks for the profile. */
  | { kind: "joining"; needsProfile: boolean };

/**
 * Who is looking (P1-04, C-52), read per request and never cached. Any signed-in account may join as a
 * customer (PRODUCT §2), staff and admins included.
 */
async function visitorState(shopId: string): Promise<Visitor> {
  const principal = await currentPrincipal();
  if (!principal) return { kind: "signed-out" };
  const scope = await requireCustomer(principal);
  const [member, memberId] = await Promise.all([isOwnMember(scope, shopId), ownMemberId(scope)]);
  return member ? { kind: "member" } : { kind: "joining", needsProfile: memberId === null };
}

export default async function ShopLandingPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
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

  const query = await searchParams;
  const visitor = await visitorState(data.shop.id);
  const shopPage = `/shops/${data.shop.id}`;
  // Back from sign-in (`returnTo=/s/{code}?join=1`) as an existing member: straight to the shop page.
  if (visitor.kind === "member" && query.join === "1") redirect(shopPage);
  const ctaClass = buttonClasses({ size: 56, block: true });
  const collect =
    visitor.kind === "signed-out" ? (
      <Link
        href={`/sign-in?returnTo=${encodeURIComponent(`/s/${code}?join=1`)}`}
        className={ctaClass}
        data-testid="landing-collect"
      >
        Collect points
      </Link>
    ) : visitor.kind === "member" ? (
      <Link href={shopPage} className={ctaClass} data-testid="landing-collect">
        Collect points
      </Link>
    ) : (
      <JoinSheet
        shopCode={code}
        shopName={data.shop.name}
        needsProfile={visitor.needsProfile}
        consent={{
          version: MARKETING_CONSENT_VERSION,
          text: marketingConsentText(data.shop.name),
        }}
        autoOpen={query.join === "1"}
      />
    );
  const gate = gateEntrySource(query.src);
  const nonce = gate ? ((await headers()).get("x-nonce") ?? undefined) : undefined;
  return (
    <>
      {gate ? (
        <GildedGate
          code={code}
          name={data.shop.name}
          logoUrl={data.shop.logoUrl}
          coverUrl={data.shop.coverUrl}
          nonce={nonce}
        />
      ) : null}
      <ShopLanding
        data={data}
        collect={collect}
        member={visitor.kind === "member"}
        now={new Date()}
      />
      {gate ? <GildedGateMorph nonce={nonce} /> : null}
    </>
  );
}
