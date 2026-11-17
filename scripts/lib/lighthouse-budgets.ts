/**
 * Lighthouse performance budgets (DESIGN §12) and the judgment rule (CLAUDE.md §3): a metric up to 15% over
 * its budget is a "judgment" (accepted only with a one-line DECISIONS entry), more is a fail.
 * Pure: the Playwright `lighthouse` project (tests/perf) measures, this module decides.
 */

export type Metrics = {
  /** Largest Contentful Paint, ms (Lighthouse mobile, simulated throttling). */
  lcpMs: number;
  /** Cumulative Layout Shift. */
  cls: number;
  /** Every script the page loads on first navigation, gzip-compressed, bytes. */
  jsGzipBytes: number;
};
export type Budget = Metrics;
export type MetricStatus = "pass" | "judgment" | "fail";
export type MetricVerdict = {
  metric: keyof Metrics;
  value: number;
  budget: number;
  status: MetricStatus;
};
export type Verdict = { status: MetricStatus; metrics: MetricVerdict[] };

export const JUDGMENT_MARGIN = 0.15;

/** DESIGN §12: customer routes. */
export const CUSTOMER_BUDGET: Budget = { lcpMs: 2500, cls: 0.05, jsGzipBytes: 170 * 1024 };
/** DESIGN §12: the shop landing `/s/[code]` is the first page a scanning customer sees. */
export const LANDING_BUDGET: Budget = { ...CUSTOMER_BUDGET, jsGzipBytes: 130 * 1024 };

const ORDER: MetricStatus[] = ["pass", "judgment", "fail"];

function statusOf(value: number, budget: number): MetricStatus {
  if (!Number.isFinite(value)) return "fail";
  if (value <= budget) return "pass";
  return value <= budget * (1 + JUDGMENT_MARGIN) ? "judgment" : "fail";
}

export function evaluateBudget(m: Metrics, b: Budget): Verdict {
  const metrics = (Object.keys(b) as (keyof Metrics)[]).map((metric) => ({
    metric,
    value: m[metric],
    budget: b[metric],
    status: statusOf(m[metric], b[metric]),
  }));
  const worst = Math.max(...metrics.map((v) => ORDER.indexOf(v.status)));
  return { status: ORDER[worst] ?? "fail", metrics };
}

const FORMAT: Record<keyof Metrics, (v: MetricVerdict) => string> = {
  lcpMs: (v) => `LCP ${(v.value / 1000).toFixed(2)} s ≤ ${(v.budget / 1000).toFixed(2)} s`,
  cls: (v) => `CLS ${v.value.toFixed(3)} ≤ ${v.budget.toFixed(3)}`,
  jsGzipBytes: (v) =>
    `JS ${(v.value / 1024).toFixed(1)} KB ≤ ${(v.budget / 1024).toFixed(1)} KB gzip`,
};

/** One evidence line: `landing PASS · LCP 1.80 s ≤ 2.50 s (pass) · …`. */
export function formatVerdict(name: string, v: Verdict): string {
  const parts = v.metrics.map((m) => `${FORMAT[m.metric](m)} (${m.status})`);
  return `${name} ${v.status.toUpperCase()} · ${parts.join(" · ")}`;
}

/**
 * Initial JS = every script the HTML itself loads (`<script src>`, third-party too). Chunks loaded later by
 * `import()` (Sentry on idle, `next/dynamic` moments) are excluded, like Next's "first load JS", and so are
 * `nomodule` polyfills.
 */
export function htmlScriptUrls(html: string, pageUrl: string): string[] {
  const urls = [...html.matchAll(/<script\b[^>]*>/gi)]
    .map((m) => m[0])
    // `nomodule` polyfills: browsers with ES modules (every supported one) never download them.
    .filter((tag) => !/\snomodule\b/i.test(tag))
    .map((tag) => /\ssrc=(["'])([^"']+)\1/i.exec(tag)?.[2])
    .filter((src): src is string => src !== undefined)
    .map((src) => new URL(src, pageUrl).toString());
  return [...new Set(urls)];
}
