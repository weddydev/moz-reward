import {
  CalendarX,
  ChevronRight,
  Clock,
  Info,
  MapPin,
  Navigation,
  PartyPopper,
  Phone,
  Receipt,
  Settings,
} from "lucide-react";
import { IngotPour } from "@/components/motion/IngotPour";
import { TransitionLink } from "@/components/motion/TransitionLink";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { addressLine, areaLine, statusLabel, weekRows } from "@/features/landing/view";
import type { VaultView } from "@/features/vault/view";
import type { MemberId } from "@/lib/brand";
import { openStatus } from "@/lib/open-status";
import { directionsUrl, telHref } from "@/lib/shop-links";
import { londonDate } from "@/lib/time";
import type { ShopLandingData } from "@/server/repos/shops";
import { MemberIdCard } from "./MemberIdCard";
import { MembershipControls } from "./MembershipControls";
import { SHOP_PAGE_CLASS, ShopPageHeader } from "./ShopPageHeader";
import { leaveRestoreBy, upcomingClosures, vaultCardText } from "./view";

type Live = Extract<ShopLandingData, { kind: "live" }>;

/**
 * The customer's shop page, screen 4 (DESIGN §15, PRODUCT §4; P1-09). Cover, logo and name (the shared
 * elements a Wallet card morphs into), open status, Directions and Call; then two columns from 1024px: the
 * Gold Vault card (the pour on every view), the member ID and recent receipts on the left; the shop's details
 * and the member's own settings (mute, leave) on the right. A non-member (never joined, or left) sees the
 * join CTA in place of the member sections. Slots filled by later tasks: Request points and the pending state
 * (P1-11), recent receipts' rows (P1-12), Show member QR (P1-14), offers carousel (P3-05), rate row (P3-01).
 * Server component; the pour and the settings are the only client parts.
 */
export function MemberShopPage({
  shop,
  details,
  member,
  vault,
  welcome,
  join,
  now,
}: {
  shop: { shopId: string; name: string; logoUrl: string | null; muted: boolean };
  /** The shop's public profile (cached landing data); null while the shop is suspended or closed. */
  details: Live | null;
  /** The member's card, or null for a non-member (who gets `join` instead of the member sections). */
  member: { memberId: MemberId; fullName: string } | null;
  /** The Gold Vault card; null when the shop has no programme yet. */
  vault: VaultView | null;
  welcome: boolean;
  /** The join CTA (with its sheet) for a non-member. */
  join?: React.ReactNode;
  now: Date;
}): React.JSX.Element {
  const today = londonDate(now);
  const status = details ? statusLabel(openStatus(details, now), today) : null;
  const directions = details ? directionsUrl(details.shop.location) : null;
  const tel = details ? telHref(details.shop.phone) : null;

  return (
    <div className={SHOP_PAGE_CLASS} data-page="member-shop">
      <div className="flex flex-col">
        <ShopPageHeader
          shopId={shop.shopId}
          name={shop.name}
          logoUrl={shop.logoUrl}
          coverUrl={details?.shop.coverUrl ?? null}
          meta={details ? areaLine(details.shop.category, details.shop.town) : null}
        />
        <div className="mt-4 flex flex-col gap-3">
          {status ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>
                <span data-testid="shop-status">{status.text}</span>
              </Badge>
              {member ? <Badge tone="happy-hour">You&rsquo;re a member</Badge> : null}
            </div>
          ) : null}
          {directions || tel ? (
            <div className="flex flex-wrap gap-2" data-testid="shop-contact">
              {directions ? (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "orbit" })}
                  data-testid="shop-directions"
                >
                  <Icon icon={Navigation} size={18} /> Directions
                </a>
              ) : null}
              {tel ? (
                <a
                  href={tel}
                  className={buttonClasses({ variant: "orbit" })}
                  data-testid="shop-call"
                >
                  <Icon icon={Phone} size={18} /> Call
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {welcome && member ? (
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

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          {member ? (
            <>
              <VaultCard shopId={shop.shopId} shopName={shop.name} vault={vault} />
              <MemberIdCard memberId={member.memberId} fullName={member.fullName} />
              <Card className="flex flex-col gap-3 p-5" data-testid="shop-receipts">
                <h2 className="text-h2 flex items-center gap-2">
                  <Icon icon={Receipt} className="text-gold-700" /> Recent receipts
                </h2>
                <EmptyState
                  title="No receipts yet"
                  message="Each time staff approve your gold, the receipt shows here."
                />
              </Card>
            </>
          ) : (
            <Card className="flex flex-col gap-4 p-5" data-testid="shop-join">
              <div className="flex flex-col gap-1">
                <h2 className="text-h2">Collect gold at {shop.name}</h2>
                <p className="text-body text-ink-2">
                  Join to collect gold on every visit and unlock rewards.
                </p>
              </div>
              {join}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {details ? <DetailsCard details={details} today={today} /> : null}
          {member ? (
            <Card className="flex flex-col gap-4 p-5" data-testid="shop-settings">
              <h2 className="text-h2 flex items-center gap-2">
                <Icon icon={Settings} className="text-gold-700" /> Your membership
              </h2>
              <MembershipControls
                shopId={shop.shopId}
                shopName={shop.name}
                muted={shop.muted}
                restoreBy={leaveRestoreBy(now)}
              />
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The Gold Vault card: the current ingot pours to the member's level on every view (DESIGN §8.2). */
function VaultCard({
  shopId,
  shopName,
  vault,
}: {
  shopId: string;
  shopName: string;
  vault: VaultView | null;
}): React.JSX.Element {
  if (!vault) {
    return (
      <Card className="flex flex-col gap-2 p-5" data-testid="shop-vault">
        <h2 className="text-h2">Your Gold Vault</h2>
        <p className="text-body text-ink-2">
          {shopName} hasn&rsquo;t set up its rewards yet. Check back soon.
        </p>
      </Card>
    );
  }
  const text = vaultCardText(vault);
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="shop-vault">
      <h2 className="text-h2">Your Gold Vault</h2>
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-center gap-4">
        <IngotPour gold={vault.ingot.gold} size={vault.ingot.size} seenKey={shopId} />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-h1 tabular-nums" data-testid="shop-vault-percent">
            {text.percent}%
          </p>
          <p className="text-small text-ink-2 tabular-nums" data-testid="shop-vault-gold">
            {text.gold}
          </p>
          <p className="text-small break-words" data-testid="shop-vault-next">
            {text.next}
          </p>
        </div>
      </div>
      <TransitionLink
        href={`/vault/${shopId}`}
        direction="forward"
        className={buttonClasses({ variant: "orbit", block: true })}
        data-testid="shop-vault-link"
      >
        Open your Gold Vault <Icon icon={ChevronRight} size={18} />
      </TransitionLink>
    </Card>
  );
}

/** Opening hours (today in bold), special closures from today on, address and about (PRODUCT §4). */
function DetailsCard({ details, today }: { details: Live; today: string }): React.JSX.Element {
  const { shop } = details;
  const address = addressLine([shop.addressLine1, shop.addressLine2, shop.town, shop.postcode]);
  const closures = upcomingClosures(details.closures, today);
  const todayIndex = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="shop-details">
      <section className="flex flex-col gap-3" aria-labelledby="shop-hours-title">
        <h2 id="shop-hours-title" className="text-h2 flex items-center gap-2">
          <Icon icon={Clock} className="text-gold-700" /> Opening hours
        </h2>
        {details.hours.length ? (
          <dl
            className="text-small grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"
            data-testid="shop-hours"
          >
            {weekRows(details.hours).map((row, i) => (
              <div key={row.day} className="contents">
                <dt className={i === todayIndex ? "font-semibold" : "text-ink-2"}>{row.day}</dt>
                <dd className={i === todayIndex ? "font-semibold" : "text-ink-2"}>{row.times}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-small text-ink-2">Opening hours not added yet.</p>
        )}
      </section>

      {closures.length ? (
        <section
          className="flex flex-col gap-2"
          aria-labelledby="shop-closures-title"
          data-testid="shop-closures"
        >
          <h3 id="shop-closures-title" className="text-body flex items-center gap-2 font-semibold">
            <Icon icon={CalendarX} size={18} className="text-gold-700" /> Special closures
          </h3>
          <ul className="text-small text-ink-2 flex flex-col gap-1">
            {closures.map((c) => (
              <li key={c.date}>
                <span className="text-ink font-semibold">{c.label}</span>
                {c.note ? ` · ${c.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="shop-address-title">
        <h2 id="shop-address-title" className="text-h2 flex items-center gap-2">
          <Icon icon={MapPin} className="text-gold-700" /> Address
        </h2>
        <p className="text-small text-ink-2" data-testid="shop-address">
          {address ?? "Address not added yet."}
        </p>
      </section>

      {shop.description ? (
        <section className="flex flex-col gap-2" aria-labelledby="shop-about-title">
          <h2 id="shop-about-title" className="text-h2 flex items-center gap-2">
            <Icon icon={Info} className="text-gold-700" /> About
          </h2>
          <p className="text-small text-ink-2 break-words" data-testid="shop-about">
            {shop.description}
          </p>
        </section>
      ) : null}
    </Card>
  );
}
