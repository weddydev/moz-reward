import { Clock, Gift, MapPin, Navigation, Phone } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { CoverPhoto } from "@/components/ui/CoverPhoto";
import { Icon } from "@/components/ui/Icon";
import { Ingot } from "@/components/ui/Ingot";
import { ShopCoin, ShopImage } from "@/components/ui/ShopImage";
import { initialsOf } from "@/lib/initials";
import { openStatus } from "@/lib/open-status";
import { directionsUrl, telHref } from "@/lib/shop-links";
import { londonDate } from "@/lib/time";
import type { ShopLandingData } from "@/server/repos/shops";
import { addressLine, areaLine, statusLabel, weekRows } from "./view";

type Live = Extract<ShopLandingData, { kind: "live" }>;

/** Marks content that rises in order as the Gilded Gate lands (P1-03; inert when no gate plays). */
const rise = (i: number): { "data-gate-rise": ""; style: React.CSSProperties } => ({
  "data-gate-rise": "",
  style: { "--rise-i": i } as React.CSSProperties,
});

/**
 * Shop landing, screen 1 (DESIGN §15; P1-02; Molten restyle PD-11, extended from the reference's shop cover).
 * Server component; its only client part is the cover photo's load-error fallback. Mobile: the shop page's
 * cover (photo under a dark shade, name and area line on it, the logo in a gold ring), then status, description
 * and the stacked CTAs, then placed cards. Desktop (≥ 1024px): split hero, cover left, status and CTAs right,
 * cards row below. "Rate your visit" and "Today's offer" stay hidden until P3 provides
 * them. The reward preview (P1-08, C-50) shows once the shop has a programme: a static ingot filled to the
 * first reward, what it is and the gold it needs, and the full-ingot reward.
 */
export function ShopLanding({
  data,
  collect,
  member,
  now,
}: {
  data: Live;
  /** The "Collect points" CTA for this visitor (sign-in link, join sheet, or the member's shop page link). */
  collect: React.ReactNode;
  member: boolean;
  now: Date;
}): React.JSX.Element {
  const { shop } = data;
  /** The cards row rises in reading order: reward 4 (when shown), then hours, then Find us. */
  const after = data.reward ? 5 : 4;
  const status = statusLabel(openStatus(data, now), londonDate(now));
  const address = addressLine([shop.addressLine1, shop.addressLine2, shop.town, shop.postcode]);
  const directions = directionsUrl(shop.location);
  const tel = telHref(shop.phone);
  const todayDate = londonDate(now);
  const today = (new Date(`${todayDate}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0, London calendar

  return (
    <main id="main" data-page="shop-landing" className="min-h-dvh">
      <div className="mx-auto w-full max-w-[560px] px-4 pt-4 lg:grid lg:max-w-[1280px] lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-10 lg:pt-10">
        <header className="m-cover m-cover-landing" data-testid="landing-hero">
          <div className="m-cover-art" data-gate-cover="">
            <CoverArt coverUrl={shop.coverUrl} page />
          </div>
          <div className="m-cover-text" {...rise(1)}>
            <h1 className="m-cover-title" data-testid="landing-name">
              {shop.name}
            </h1>
            <p className="m-cover-meta">{areaLine(shop.category, shop.town)}</p>
          </div>
          <span className="m-cover-logo" aria-hidden="true" data-testid="shop-logo" {...rise(0)}>
            {shop.logoUrl ? (
              <ShopImage src={shop.logoUrl} size={LOGO} eager />
            ) : (
              <ShopCoin name={shop.name} size={LOGO} />
            )}
          </span>
        </header>

        <section className="flex flex-col gap-5 pt-5 pb-8 lg:py-0">
          <div className="flex flex-col gap-3" {...rise(2)}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>
                <span data-testid="landing-status">{status.text}</span>
              </Badge>
              {member ? <Badge tone="happy-hour">You&rsquo;re a member</Badge> : null}
            </div>
            {shop.description ? <p className="text-body text-ink-2">{shop.description}</p> : null}
          </div>
          <div className="flex flex-col gap-3" {...rise(3)}>
            {collect}
          </div>
        </section>
      </div>

      <div
        className={`mx-auto grid w-full max-w-[560px] gap-4 px-4 pb-10 lg:mt-10 lg:max-w-[1280px] lg:gap-6 lg:px-10 ${data.reward ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
      >
        {data.reward ? <RewardPreviewCard reward={data.reward} /> : null}
        <Card className="flex flex-col gap-3 p-5" data-testid="landing-hours" {...rise(after)}>
          <h2 className="text-h2 flex items-center gap-2">
            <Icon icon={Clock} className="text-gold-deep" /> Opening hours
          </h2>
          {data.hours.length ? (
            <dl className="text-small grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {weekRows(data.hours).map((row, i) => (
                <div key={row.day} className="contents">
                  <dt className={i === today ? "font-semibold" : "text-ink-2"}>{row.day}</dt>
                  <dd className={i === today ? "font-semibold" : "text-ink-2"}>{row.times}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-small text-ink-2">Opening hours not added yet.</p>
          )}
        </Card>

        <Card
          className="flex flex-col gap-3 p-5"
          data-testid="landing-details"
          {...rise(after + 1)}
        >
          <h2 className="text-h2 flex items-center gap-2">
            <Icon icon={MapPin} className="text-gold-deep" /> Find us
          </h2>
          {address ? <p className="text-small text-ink-2">{address}</p> : null}
          {directions || tel ? (
            <div className="flex flex-wrap gap-2">
              {directions ? (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "orbit", size: 46 })}
                >
                  <Icon icon={Navigation} size={16} /> Directions
                </a>
              ) : null}
              {tel ? (
                <a href={tel} className={buttonClasses({ variant: "orbit", size: 46 })}>
                  <Icon icon={Phone} size={16} /> Call
                </a>
              ) : null}
            </div>
          ) : null}
          {!address && !directions && !tel ? (
            <p className="text-small text-ink-2">Contact details not added yet.</p>
          ) : null}
        </Card>
      </div>

      <LandingFooter />
    </main>
  );
}

const gb = (n: number): string => n.toLocaleString("en-GB");

function RewardPreviewCard({ reward }: { reward: NonNullable<Live["reward"]> }): React.JSX.Element {
  const { next, main, ingotSize } = reward;
  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="landing-reward" {...rise(4)}>
      <h2 className="text-h2 flex items-center gap-2">
        <Icon icon={Gift} className="text-gold-deep" /> Rewards
      </h2>
      <div className="flex items-center gap-4">
        {/* Filled to the first reward; the text beside it says everything it shows. */}
        <div className="w-24 shrink-0">
          <Ingot gold={next.gold} size={ingotSize} decorative />
        </div>
        <dl className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col">
            <dt className="text-caption text-ink-2">
              {next.percent === 100 ? "Fill the ingot for" : "First reward"}
            </dt>
            <dd className="text-body font-semibold [overflow-wrap:anywhere]">{next.title}</dd>
            <dd className="text-small text-ink-2">at {gb(next.gold)} gold</dd>
          </div>
          {next.percent === 100 ? null : (
            <div className="flex flex-col">
              <dt className="text-caption text-ink-2">Full ingot</dt>
              <dd className="text-body font-semibold [overflow-wrap:anywhere]">{main.text}</dd>
              <dd className="text-small text-ink-2">at {gb(main.gold)} gold</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

/** The cover photo's widths: the page column (560 px phones and tablets, half of the 1280 px row from 1024px). */
const COVER_SIZES = "(min-width: 1024px) 580px, (min-width: 592px) 560px, 100vw";

/** The cover's logo, in px (the shop page's `.m-cover-logo`). */
const LOGO = 60;

/**
 * The cover's picture (PD-11, the shop page's cover language): the uploaded photo, or the dark photo ground when
 * there is none (or it can't load), under the dark-to-clear shade and the gold glow. Also drawn inside the Gilded
 * Gate (P1-03) for its morph, without test ids or the high fetch priority (`page` false); the same `sizes`, so
 * the clone and the page pick the same file.
 */
export function CoverArt({
  coverUrl,
  page = false,
}: {
  coverUrl: string | null;
  page?: boolean;
}): React.JSX.Element {
  return (
    <>
      {coverUrl ? (
        <CoverPhoto
          src={coverUrl}
          className="m-art-photo"
          sizes={COVER_SIZES}
          eager
          priority={page}
          {...(page ? { testId: "landing-cover" } : {})}
        />
      ) : (
        <span
          className="m-art-ground"
          aria-hidden="true"
          {...(page ? { "data-testid": "landing-cover-fallback" } : {})}
        />
      )}
      <span className="m-art-shade" aria-hidden="true" />
    </>
  );
}

export function ShopLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}): React.JSX.Element {
  return (
    <span
      data-testid="shop-logo"
      className="border-surface bg-champagne shadow-lift grid size-20 shrink-0 place-items-center overflow-hidden rounded-[var(--r-md)] border-4"
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" width={80} height={80} className="size-full object-cover" />
      ) : (
        <span className="text-h2 text-ink" data-testid="landing-logo-fallback">
          {initialsOf(name)}
        </span>
      )}
    </span>
  );
}

export function LandingFooter(): React.JSX.Element {
  return (
    <footer className="text-caption text-ink-2 border-line mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t px-5 pt-6 pb-[max(24px,env(safe-area-inset-bottom))]">
      <span>Powered by Moz Rewards</span>
      {/* Plain links (no prefetch): the legal pages ship in P5 (CARRIED C-51). Underlined at rest (touch has no
          hover) with a 44px hit area (DESIGN §13). */}
      <a href="/terms" className="hit-44 underline underline-offset-2">
        Terms
      </a>
      <a href="/privacy" className="hit-44 underline underline-offset-2">
        Privacy
      </a>
    </footer>
  );
}
