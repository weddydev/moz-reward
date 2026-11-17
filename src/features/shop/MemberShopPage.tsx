import { PartyPopper } from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ShopLogo } from "@/features/landing/ShopLanding";
import { MemberIdCard } from "./MemberIdCard";

/**
 * The customer's shop page, minimal first version (P1-04): shop identity, the first-join welcome and the member
 * ID card. P1-09 builds the full screen 4 (Gold Vault, request points, offers, details) on this route.
 */
export function MemberShopPage({
  shop,
  member,
  welcome,
}: {
  shop: { name: string; shopCode: string; logoUrl: string | null };
  member: { memberId: string; fullName: string };
  welcome: boolean;
}): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-8 lg:max-w-3xl"
      data-page="member-shop"
    >
      <header className="flex items-center gap-4">
        <ShopLogo name={shop.name} logoUrl={shop.logoUrl} />
        <h1 className="text-h1 min-w-0 break-words" data-testid="member-shop-name">
          {shop.name}
        </h1>
      </header>

      {welcome ? (
        <Card className="flex items-start gap-3 p-5" role="status" data-testid="join-welcome">
          <Icon icon={PartyPopper} className="text-gold-700 mt-1 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-h2">Welcome to {shop.name}</p>
            <p className="text-body text-ink-2">
              You&rsquo;re a member now. Collect gold on every visit and it builds towards rewards.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <MemberIdCard memberId={member.memberId} fullName={member.fullName} />
        <div className="mt-6 flex flex-col gap-3 lg:mt-0">
          <Link
            href={`/s/${shop.shopCode}`}
            className={buttonClasses({ variant: "secondary", block: true })}
          >
            Shop details
          </Link>
          <Link href="/wallet" className={buttonClasses({ variant: "ghost", block: true })}>
            Go to my wallet
          </Link>
        </div>
      </div>
    </div>
  );
}
