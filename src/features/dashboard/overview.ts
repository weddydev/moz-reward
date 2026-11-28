/**
 * The shop dashboard Overview's view (P2-01, PRODUCT §14, DESIGN §15 screen 15): KPI cards, the weekly visits
 * chart and the plan banner, built from the repo's per-day totals. Pure, so the role split and the copy are
 * unit-tested; the page decides what it reads and renders.
 */
import {
  changePercent,
  type DayBucket,
  type DayTotals,
  seriesFor,
  sumSince,
  weekStartDate,
} from "@/lib/dashboard/kpis";

export type KpiKey = "visits" | "gold" | "joins" | "claims";
export type KpiChange = { text: string; direction: "up" | "down" | "flat" };
export type KpiView = {
  key: KpiKey;
  label: string;
  value: string;
  series: number[];
  change?: KpiChange | undefined;
};
export type ChartBar = {
  date: string;
  label: string;
  title: string;
  value: number;
  today: boolean;
};
export type OverviewView = { kpis: KpiView[]; chart: ChartBar[]; weekVisits: number };

const count = new Intl.NumberFormat("en-GB");
/** "−120", never "-120": the typographic minus, as elsewhere in the app's numbers. */
const fmt = (n: number): string => count.format(n).replace("-", "−");

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function vsYesterday(series: readonly number[]): KpiChange | undefined {
  const today = series.at(-1) ?? 0;
  const pct = changePercent(today, series.at(-2) ?? 0);
  if (pct === null) return undefined;
  if (pct === 0) return { text: "Same as yesterday", direction: "flat" };
  return pct > 0
    ? { text: `+${fmt(pct)}% vs yesterday`, direction: "up" }
    : { text: `${fmt(pct)}% vs yesterday`, direction: "down" };
}

export function overviewView(input: {
  days: readonly DayBucket[];
  totals: ReadonlyMap<string, DayTotals>;
  now: Date;
}): OverviewView {
  const { days, totals } = input;
  const pick = (k: keyof DayTotals): number[] =>
    seriesFor(days, new Map([...totals].map(([d, t]) => [d, t[k]])));
  const visits = pick("visits");
  const gold = pick("gold");
  const joins = pick("joins");
  const claims = days.map(() => 0); // offers arrive in P3
  const today = (s: readonly number[]): string => fmt(s.at(-1) ?? 0);
  const monday = weekStartDate(input.now);

  return {
    kpis: [
      {
        key: "visits",
        label: "Visits today",
        value: today(visits),
        series: visits,
        change: vsYesterday(visits),
      },
      {
        key: "gold",
        label: "Gold issued today",
        value: today(gold),
        series: gold,
        change: vsYesterday(gold),
      },
      {
        key: "joins",
        label: "New customers this week",
        value: fmt(sumSince(days, joins, monday)),
        series: joins,
      },
      { key: "claims", label: "Offers claimed today", value: "0", series: claims },
    ],
    chart: days.map((d, i) => {
      const at = new Date(`${d.date}T12:00:00Z`);
      const value = visits[i] ?? 0;
      return {
        date: d.date,
        label: WEEKDAY.format(at),
        title: `${DAY_MONTH.format(at).replace(",", "")}: ${fmt(value)} ${value === 1 ? "visit" : "visits"}`,
        value,
        today: i === days.length - 1,
      };
    }),
    weekVisits: visits.reduce((a, b) => a + b, 0),
  };
}

export type PlanBanner = { tone: "warning" | "danger"; title: string; text: string };

/** The owner's plan banner per plan state (PRODUCT §15); P2-10 adds the dates and the reminders. */
export const PLAN_BANNERS = {
  expiring: {
    tone: "warning",
    title: "Your plan ends soon",
    text: "Renew before it ends to keep offers, announcements and your listing running.",
  },
  grace: {
    tone: "warning",
    title: "Your plan has ended",
    text: "You're in the grace period. Renew now, or the dashboard becomes read-only when it ends.",
  },
  restricted: {
    tone: "danger",
    title: "Your dashboard is read-only",
    text: "Your plan has lapsed, so new offers and announcements are paused. You can still approve visits and redeem rewards. Renew to switch everything back on.",
  },
} as const satisfies Record<string, PlanBanner>;

/** The banner for this plan state, or null. Owner only: the plan is the owner's (PRODUCT §2 "plan view"). */
export function planBanner(status: string, role: "owner" | "staff"): PlanBanner | null {
  if (role !== "owner") return null;
  return status in PLAN_BANNERS ? PLAN_BANNERS[status as keyof typeof PLAN_BANNERS] : null;
}
