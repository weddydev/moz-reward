import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, type APIRequestContext } from "@playwright/test";
import {
  LANDING_BUDGET,
  evaluateBudget,
  formatVerdict,
  htmlScriptUrls,
  type Budget,
  type Metrics,
} from "../../scripts/lib/lighthouse-budgets";
import { clientHeaders, expect, test, testApiHeaders } from "../e2e/support/test";

// Lighthouse CI (TESTING §4, DESIGN §12): mobile, simulated throttling, against the production build.
// Runs only in the `lighthouse` Playwright project (`pnpm test:lighthouse`, part of `pnpm gate:phase`).
// Each route: set up its data, audit it once, write the report to .artifacts/lighthouse/, assert the budget
// (≤ 15% over is a judgment: it passes only for a metric the route lists in `judgment` with its DECISIONS
// entry; more than 15% over always fails, CLAUDE.md §3).

const OUT = path.join(".artifacts", "lighthouse");

type Route = {
  name: string;
  budget: Budget;
  /** Creates the route's data and returns its path. */
  setup: (request: APIRequestContext) => Promise<string>;
  /** Metrics accepted in the judgment zone (≤ 15% over), each with the DECISIONS entry that accepts it. */
  judgment?: Partial<Record<keyof Metrics, string>>;
};

const ROUTES: Route[] = [
  {
    name: "landing",
    budget: LANDING_BUDGET,
    setup: async (request) => {
      const res = await request.post("/api/test/shop", {
        data: { status: "active", name: "Brew & Bloom Café", details: true },
        headers: testApiHeaders(),
      });
      expect(res.ok()).toBe(true);
      const { shopCode } = (await res.json()) as { shopCode: string };
      return `/s/${shopCode}?src=qr`;
    },
    // Next 16 + React 19's own runtime is ~131 KB gzip, over the 130 KB landing budget by itself.
    judgment: { jsGzipBytes: "DECISIONS 2026-11-17 landing JS" },
  },
];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("no port"));
      });
    });
  });
}

for (const route of ROUTES) {
  test(`[P1-02] Lighthouse mobile: ${route.name} within DESIGN §12 budget`, async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const routePath = await route.setup(request);
    const url = new URL(routePath, baseURL).toString();
    const port = await freePort();
    const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    try {
      const { default: lighthouse } = await import("lighthouse");
      const result = await lighthouse(url, {
        port,
        logLevel: "error",
        output: "html",
        onlyCategories: ["performance"],
        // A fresh client IP, as every spec uses: the lookup limit is per IP (P1-02).
        extraHeaders: clientHeaders(),
      });
      if (!result) throw new Error("Lighthouse returned no result");
      const { lhr } = result;
      expect(lhr.runtimeError, lhr.runtimeError?.message).toBeUndefined();
      expect(lhr.configSettings.formFactor).toBe("mobile");
      expect(lhr.configSettings.throttlingMethod).toBe("simulate");

      // Initial JS: the scripts this route's HTML loads (lazy chunks such as Sentry-on-idle excluded).
      const html = await request.get(routePath, { headers: clientHeaders() });
      expect(html.ok()).toBe(true);
      const scripts = htmlScriptUrls(await html.text(), url);
      expect(scripts.length).toBeGreaterThan(0);
      let jsGzipBytes = 0;
      for (const src of scripts) {
        const body = await request.get(src);
        expect(body.ok(), src).toBe(true);
        jsGzipBytes += gzipSync(await body.body()).length;
      }
      const metrics = {
        lcpMs: lhr.audits["largest-contentful-paint"]?.numericValue ?? Number.NaN,
        cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? Number.NaN,
        jsGzipBytes,
      };
      const verdict = evaluateBudget(metrics, route.budget);
      const line = formatVerdict(route.name, verdict);
      const score = Math.round((lhr.categories.performance?.score ?? 0) * 100);

      mkdirSync(OUT, { recursive: true });
      writeFileSync(path.join(OUT, `${route.name}.html`), result.report as string);
      writeFileSync(
        path.join(OUT, `${route.name}.json`),
        JSON.stringify({ url: routePath, score, metrics, verdict, scripts }, null, 2),
      );
      console.warn(`[lighthouse] ${line} · score ${score} · ${scripts.length} scripts`);

      const unaccepted = verdict.metrics.filter(
        (m) => m.status === "fail" || (m.status === "judgment" && !route.judgment?.[m.metric]),
      );
      expect(
        unaccepted.map((m) => m.metric),
        line,
      ).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
