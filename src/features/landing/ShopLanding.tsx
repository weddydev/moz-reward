import { Clock, MapPin, Navigation, Phone, Store } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { initialsOf } from "@/lib/initials";
import { openStatus } from "@/lib/open-status";
import { directionsUrl, telHref } from "@/lib/shop-links";
import type { ShopLandingData } from "@/server/repos/shops";
import { addressLine, areaLine, londonDate, statusLabel, weekRows } from "./view";

type Live = Extract<ShopLandingData, { kind: "live" }>;

/** Marks content that rises in order as the Gilded Gate lands (P1-03; inert when no gate plays). */
const rise = (i: number): { "data-gate-rise": ""; style: React.CSSProperties } => ({
  "data-gate-rise": "",
  style: { "--rise-i": i } as React.CSSProperties,
});

/**
 * Shop landing, screen 1 (DESIGN §15; P1-02). Server component, no client JS of its own. Mobile: cover with
 * an ivory fade, overlapping logo, stacked CTAs, details. Desktop (≥ 1024px): split hero, cover left, details
 * and CTAs right, cards row below. "Rate your visit" and "Today's offer" stay hidden until P3 provides
 * them; the reward preview arrives with the loyalty programme (P1-05/P1-08, CARRIED C-50).
 */
export function ShopLanding({
  data,
  collectHref,
  member,
  now,
}: {
  data: Live;
  collectHref: string;
  member: boolean;
  now: Date;
}): React.JSX.Element {
  const { shop } = data;
  const status = statusLabel(openStatus(data, now), londonDate(now));
  const address = addressLine([shop.addressLine1, shop.addressLine2, shop.town, shop.postcode]);
  const directions = directionsUrl(shop.location);
  const tel = telHref(shop.phone);
  const todayDate = londonDate(now);
  const today = (new Date(`${todayDate}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0, London calendar

  return (
    <main id="main" data-page="shop-landing" className="bg-bg min-h-dvh">
      <div className="mx-auto w-full max-w-[1280px] lg:grid lg:grid-cols-2 lg:gap-10 lg:px-10 lg:pt-10">
        <div className="relative">
          <div
            className="relative aspect-[16/10] w-full overflow-hidden lg:aspect-[4/3] lg:rounded-[var(--r-lg)]"
            data-gate-cover=""
          >
            {shop.coverUrl ? (
              // Uploaded covers are already sized WebP/AVIF variants on the CDN (ARCHITECTURE §8).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shop.coverUrl}
                alt=""
                width={1200}
                height={750}
                fetchPriority="high"
                className="size-full object-cover"
                data-testid="landing-cover"
              />
            ) : (
              // Quiet surface + foil, not the gold gradient: gold stays ≤ 10% of the screen and belongs to
              // the Collect CTA (DESIGN §3; design review P1-02). Most new shops have no cover yet.
              <div
                className="foil bg-surface-2 relative grid size-full place-items-center"
                data-testid="landing-cover-fallback"
              >
                <Icon icon={Store} size={32} className="text-gold-700" />
              </div>
            )}
            <div className="from-bg pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t to-transparent lg:hidden" />
          </div>
          <div className="relative mx-auto -mt-10 max-w-[560px] px-5 lg:hidden" {...rise(0)}>
            <Logo name={shop.name} logoUrl={shop.logoUrl} />
          </div>
        </div>

        <section className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-5 pt-3 pb-10 lg:mx-0 lg:max-w-none lg:justify-center lg:px-0 lg:pt-0">
          <div className="hidden lg:block" {...rise(0)}>
            <Logo name={shop.name} logoUrl={shop.logoUrl} />
          </div>
          <div className="flex flex-col gap-2" {...rise(1)}>
            <h1 className="text-h1 break-words" data-testid="landing-name">
              {shop.name}
            </h1>
            <p className="text-body text-ink-2">{areaLine(shop.category, shop.town)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>
                <span data-testid="landing-status">{status.text}</span>
              </Badge>
              {member ? <Badge tone="happy-hour">You&rsquo;re a member</Badge> : null}
            </div>
          </div>
          {shop.description ? (
            <p className="text-body text-ink-2" {...rise(2)}>
              {shop.description}
            </p>
          ) : null}
          <div className="flex flex-col gap-3" {...rise(3)}>
            <Link
              href={collectHref}
              className={buttonClasses({ size: 56, block: true })}
              data-testid="landing-collect"
            >
              Collect points
            </Link>
          </div>
        </section>
      </div>

      <div className="mx-auto grid w-full max-w-[560px] gap-4 px-5 pb-10 lg:mt-10 lg:max-w-[1280px] lg:grid-cols-2 lg:gap-6 lg:px-10">
        <Card className="flex flex-col gap-3 p-5" data-testid="landing-hours" {...rise(4)}>
          <h2 className="text-h2 flex items-center gap-2">
            <Icon icon={Clock} className="text-gold-700" /> Opening hours
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

        <Card className="flex flex-col gap-3 p-5" data-testid="landing-details" {...rise(5)}>
          <h2 className="text-h2 flex items-center gap-2">
            <Icon icon={MapPin} className="text-gold-700" /> Find us
          </h2>
          {address ? <p className="text-small text-ink-2">{address}</p> : null}
          {directions || tel ? (
            <div className="flex flex-wrap gap-2">
              {directions ? (
                <a
                  href={directions}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "secondary", size: 40 })}
                >
                  <Icon icon={Navigation} size={16} /> Directions
                </a>
              ) : null}
              {tel ? (
                <a href={tel} className={buttonClasses({ variant: "secondary", size: 40 })}>
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

function Logo({ name, logoUrl }: { name: string; logoUrl: string | null }): React.JSX.Element {
  return (
    <span className="border-surface bg-gold-100 grid size-20 place-items-center overflow-hidden rounded-[var(--r-md)] border-4 shadow-[var(--shadow-2)]">
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
