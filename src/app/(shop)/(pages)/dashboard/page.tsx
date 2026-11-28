import {
  ArrowRight,
  ChartColumn,
  Coins,
  Footprints,
  Martini,
  MessageSquareText,
  ScanLine,
  Sparkles,
  TicketPercent,
  TriangleAlert,
  UserPlus,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button-classes";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { KpiCard } from "@/components/ui/KpiCard";
import {
  type KpiKey,
  overviewView,
  type PlanBanner,
  planBanner,
} from "@/features/dashboard/overview";
import { VisitsChart } from "@/features/dashboard/VisitsChart";
import { RequestsQueue } from "@/features/requests/RequestsQueue";
import { queueRows } from "@/features/requests/view";
import { cx } from "@/lib/cx";
import { londonDays } from "@/lib/dashboard/kpis";
import { gateShopRoute } from "@/server/portal/gate";
import { readDailyTotals } from "@/server/repos/dashboard";
import { listProgrammeVersions } from "@/server/repos/loyalty";
import { listTeamOpenRequests } from "@/server/repos/point-requests";
import { shopSummary } from "@/server/repos/shops";
import { REQUEST_TTL_MS } from "@/server/services/point-request-jobs";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Overview" };

/** Rows of the live queue shown here; the rest are one tap away on Requests. */
const OVERVIEW_QUEUE_ROWS = 5;

const KPI_ICONS: Record<KpiKey, LucideIcon> = {
  visits: Footprints,
  gold: Coins,
  joins: UserPlus,
  claims: TicketPercent,
};

/**
 * The shop dashboard's Overview (P2-01, PRODUCT §14, DESIGN §15 screen 15): Scan member QR, the four KPIs with
 * 7-day sparklines, the live request queue (the top 5, approve/reject in place; the layout's shop stream
 * refreshes it), suggestions, happy hour, the weekly visits chart and the latest feedback (P3 fills the empty
 * ones). Owner and staff share the page; the plan banner is the owner's, decided here on the server, so a staff
 * render never carries the plan state (DECISIONS 28 Nov "P2-01 dashboard KPIs").
 */
export default async function ShopOverviewPage(): Promise<React.JSX.Element> {
  const { shopId, scope, role } = await gateShopRoute("/dashboard");
  const now = new Date();
  const days = londonDays(now);
  const range = { from: days[0]?.start ?? now, to: days.at(-1)?.end ?? now };
  const [shop, totals, requests, versions] = await Promise.all([
    shopSummary(scope),
    readDailyTotals(scope, range),
    listTeamOpenRequests(scope, { requestedAfter: new Date(now.getTime() - REQUEST_TTL_MS) }),
    listProgrammeVersions(scope),
  ]);
  const view = overviewView({ days, totals, now });
  const rows = queueRows(requests, { versions, role, now });
  const banner = shop ? planBanner(shop.status, role) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1">Overview</h1>
          <p className="text-body text-ink-2 [overflow-wrap:anywhere]">
            {shop
              ? `Here's what's happening at ${shop.name} today.`
              : "Here's what's happening today."}
          </p>
        </div>
        {/* Phones and tablets: the big Scan button of screen 15. From lg the shell's header carries it. The
            wrapper hides it: `.m-btn` (unlayered molten.css) sets `display` and beats `lg:hidden` (KI-91). */}
        <div className="sm:shrink-0 lg:hidden">
          <Link
            href="/dashboard/scan"
            className={buttonClasses({ block: true, className: "sm:w-auto" })}
            data-testid="scan-member-qr"
          >
            <Icon icon={ScanLine} />
            Scan member QR
          </Link>
        </div>
      </header>

      {banner ? <PlanNotice banner={banner} /> : null}

      <ul aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {view.kpis.map((kpi) => (
          <li
            key={kpi.key}
            className="grid min-w-0"
            data-kpi={kpi.key}
            data-series={kpi.series.join(",")}
          >
            <KpiCard
              icon={KPI_ICONS[kpi.key]}
              label={kpi.label}
              value={kpi.value}
              trend={kpi.series}
              {...(kpi.change ? { change: kpi.change } : {})}
            />
          </li>
        ))}
      </ul>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-labelledby="queue-title"
          className="flex min-w-0 flex-col gap-3"
          data-testid="overview-queue"
        >
          <SectionHeader
            id="queue-title"
            icon={Zap}
            title="Live request queue"
            count={rows.length}
            text="Member visits waiting for you."
            link={{ href: "/dashboard/requests", label: "View all requests" }}
          />
          <RequestsQueue shopId={shopId} rows={rows.slice(0, OVERVIEW_QUEUE_ROWS)} />
          {rows.length > OVERVIEW_QUEUE_ROWS ? (
            <p className="text-small text-ink-2" data-testid="overview-queue-more">
              {rows.length - OVERVIEW_QUEUE_ROWS} more on{" "}
              <Link href="/dashboard/requests" className="text-gold-deep font-semibold underline">
                Requests
              </Link>
              .
            </p>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-2 p-4" data-testid="overview-suggestions">
            <SectionHeader
              id="suggestions-title"
              icon={Sparkles}
              title="Suggestions"
              text="Ideas to bring members back."
              link={{ href: "/dashboard/suggestions", label: "Open suggestions" }}
            />
            <Waiting
              title="No suggestions yet"
              text="Birthday and win-back ideas for your members will show here."
            />
          </Card>
          <Card className="flex flex-col gap-2 p-4" data-testid="overview-happy-hour">
            <SectionHeader
              id="happy-hour-title"
              icon={Martini}
              title="Happy hour"
              text="Extra gold at quiet times."
            />
            <Waiting
              title="No happy hour running"
              text="When a happy hour is on, its times and bonus show here."
            />
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="overview-visits">
          <SectionHeader
            id="visits-title"
            icon={ChartColumn}
            title="Weekly visits"
            text={`${view.weekVisits.toLocaleString("en-GB")} member ${view.weekVisits === 1 ? "visit" : "visits"} in the last 7 days.`}
          />
          <VisitsChart bars={view.chart} />
        </Card>
        <Card className="flex min-w-0 flex-col gap-2 p-4" data-testid="overview-feedback">
          <SectionHeader
            id="feedback-title"
            icon={MessageSquareText}
            title="Latest feedback"
            text="What your customers are saying."
            link={{ href: "/dashboard/feedback", label: "View all feedback" }}
          />
          <Waiting
            title="No feedback yet"
            text="Private feedback from your members will show here."
          />
        </Card>
      </div>
    </div>
  );
}

/** A card's empty line until its feature arrives (P3): compact, so the phone Overview stays short (screen 15). */
function Waiting({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="bg-surface-2 flex flex-col gap-0.5 rounded-xl px-4 py-3">
      <p className="text-body font-semibold">{title}</p>
      <p className="text-small text-ink-2">{text}</p>
    </div>
  );
}

function SectionHeader({
  id,
  icon,
  title,
  text,
  count,
  link,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  count?: number;
  link?: { href: string; label: string };
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 items-start gap-3">
        <span className="text-gold-deep mt-0.5" aria-hidden="true">
          <Icon icon={icon} size={24} />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="text-h3">
            {title}
            {count !== undefined ? (
              <span
                className="tabular"
                data-testid="overview-queue-count"
              >{` (${String(count)})`}</span>
            ) : null}
          </h2>
          <p className="text-small text-ink-2">{text}</p>
        </div>
      </div>
      {link ? (
        <Link
          href={link.href}
          className="text-small text-gold-deep inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-4 hover:underline"
        >
          {link.label}
          <Icon icon={ArrowRight} size={16} />
        </Link>
      ) : null}
    </div>
  );
}

/** The owner's plan notice (PRODUCT §15): a lapsing plan, the grace period, or a read-only dashboard. */
function PlanNotice({ banner }: { banner: PlanBanner }): React.JSX.Element {
  return (
    <div
      role="status"
      data-testid="plan-banner"
      data-tone={banner.tone}
      className={cx(
        "flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        banner.tone === "danger"
          ? "border-danger bg-warning-tint"
          : "border-warning bg-warning-tint",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          icon={TriangleAlert}
          className={cx("mt-0.5", banner.tone === "danger" ? "text-danger" : "text-warning")}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-body font-semibold">{banner.title}</p>
          <p className="text-small text-ink-2">{banner.text}</p>
        </div>
      </div>
      <Link
        href="/dashboard/settings"
        className={buttonClasses({ variant: "orbit", size: 46, className: "sm:shrink-0" })}
      >
        View plan
      </Link>
    </div>
  );
}
