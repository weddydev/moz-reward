import { describe, expect, it } from "vitest";
import { londonDays } from "@/lib/dashboard/kpis";
import { overviewView, PLAN_BANNERS, planBanner } from "./overview";

const NOW = new Date("2026-11-28T12:00:00Z"); // Saturday; the week began Monday 23 Nov
const days = londonDays(NOW);

const totals = new Map([
  ["2026-11-22", { visits: 3, gold: 300, joins: 4 }], // Sunday of last week
  ["2026-11-23", { visits: 5, gold: 500, joins: 1 }],
  ["2026-11-27", { visits: 34, gold: 2_850, joins: 2 }],
  ["2026-11-28", { visits: 42, gold: 3_360, joins: 3 }],
]);

describe("[P2-01] overviewView", () => {
  it("[P2-01] builds the four KPIs with 7-point series and changes vs yesterday", () => {
    const view = overviewView({ days, totals, now: NOW });
    expect(view.kpis.map((k) => k.key)).toEqual(["visits", "gold", "joins", "claims"]);
    const [visits, gold, joins, claims] = view.kpis;
    expect(visits).toMatchObject({
      label: "Visits today",
      value: "42",
      series: [3, 5, 0, 0, 0, 34, 42],
      change: { text: "+24% vs yesterday", direction: "up" },
    });
    expect(gold).toMatchObject({ label: "Gold issued today", value: "3,360" });
    expect(gold?.change).toEqual({ text: "+18% vs yesterday", direction: "up" });
    // New customers this week: Monday 23 Nov to today, not last Sunday.
    expect(joins).toMatchObject({ label: "New customers this week", value: "6" });
    expect(joins?.series).toEqual([4, 1, 0, 0, 0, 2, 3]);
    expect(joins?.change).toBeUndefined();
    // Offers arrive in P3: zero, flat.
    expect(claims).toMatchObject({ label: "Offers claimed today", value: "0" });
    expect(claims?.series).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("[P2-01] gives the weekly chart one bar per day, labelled by weekday, today last", () => {
    const view = overviewView({ days, totals, now: NOW });
    expect(view.chart.map((b) => b.label)).toEqual([
      "Sun",
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
    expect(view.chart.map((b) => b.value)).toEqual([3, 5, 0, 0, 0, 34, 42]);
    expect(view.chart.at(-1)?.today).toBe(true);
    expect(view.chart.at(-1)?.title).toBe("Sat 28 Nov: 42 visits");
    expect(view.chart[1]?.title).toBe("Mon 23 Nov: 5 visits");
  });

  it("[P2-01] shows zeros, flat lines and no change for a shop with no activity", () => {
    const view = overviewView({ days, totals: new Map(), now: NOW });
    for (const kpi of view.kpis) {
      expect(kpi.value).toBe("0");
      expect(kpi.series).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect(kpi.change).toBeUndefined();
    }
    expect(view.chart.every((b) => b.value === 0)).toBe(true);
    expect(view.weekVisits).toBe(0);
  });

  it("[P2-01] says when today is down or level with yesterday", () => {
    const down = overviewView({
      days,
      totals: new Map([
        ["2026-11-27", { visits: 40, gold: 100, joins: 0 }],
        ["2026-11-28", { visits: 30, gold: 100, joins: 0 }],
      ]),
      now: NOW,
    });
    expect(down.kpis[0]?.change).toEqual({ text: "−25% vs yesterday", direction: "down" });
    expect(down.kpis[1]?.change).toEqual({ text: "Same as yesterday", direction: "flat" });
  });

  it("[P2-01] shows a reversal-heavy day's net gold as it is", () => {
    const view = overviewView({
      days,
      totals: new Map([["2026-11-28", { visits: 0, gold: -120, joins: 0 }]]),
      now: NOW,
    });
    expect(view.kpis[1]?.value).toBe("−120");
  });
});

describe("[P2-01] planBanner", () => {
  it("[P2-01] has a banner only for expiring, grace and restricted plans", () => {
    expect(Object.keys(PLAN_BANNERS).sort()).toEqual(["expiring", "grace", "restricted"]);
    for (const status of ["pending", "active", "suspended", "closed"] as const) {
      expect(planBanner(status, "owner")).toBeNull();
    }
    expect(planBanner("expiring", "owner")?.tone).toBe("warning");
    expect(planBanner("grace", "owner")?.tone).toBe("warning");
    expect(planBanner("restricted", "owner")?.tone).toBe("danger");
  });

  it("[P2-01] never shows the plan banner to staff (the plan is the owner's, PRODUCT §2)", () => {
    for (const status of ["expiring", "grace", "restricted"] as const) {
      expect(planBanner(status, "staff")).toBeNull();
    }
  });

  it("[P2-01] tells a restricted owner that approvals and redemptions still work", () => {
    expect(planBanner("restricted", "owner")?.text).toMatch(/approve visits and redeem rewards/i);
  });
});
