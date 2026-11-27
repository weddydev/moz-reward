import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, type APIRequestContext } from "@playwright/test";
import {
  CUSTOMER_BUDGET,
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
  /** The task that added the route (test title tag). */
  task: string;
  budget: Budget;
  /** Creates the route's data and returns its path, plus request headers (a session cookie) when signed in. */
  setup: (
    request: APIRequestContext,
  ) => Promise<{ path: string; headers?: Record<string, string> }>;
  /** Metrics accepted in the judgment zone (≤ 15% over), each with the DECISIONS entry that accepts it. */
  judgment?: Partial<Record<keyof Metrics, string>>;
  /**
   * A ceiling the human accepted above the judgment zone (C-91, 27 Nov): passes up to `max`, so the route can't
   * grow past what was accepted; `by` names the DECISIONS entry.
   */
  accepted?: Partial<Record<keyof Metrics, { max: number; by: string }>>;
};

/** C-91 (human, 27 Nov 2026): initial JS as measured after the trims, held as the ceiling (DECISIONS). */
const C91 = "DECISIONS 2026-11-27 C-91 initial JS accepted (human)";

const ROUTES: Route[] = [
  {
    name: "landing",
    task: "P1-02",
    budget: LANDING_BUDGET,
    setup: async (request) => {
      const res = await request.post("/api/test/shop", {
        data: { status: "active", name: "Brew & Bloom Café", details: true },
        headers: testApiHeaders(),
      });
      expect(res.ok()).toBe(true);
      const { shopCode } = (await res.json()) as { shopCode: string };
      return { path: `/s/${shopCode}?src=qr` };
    },
    // Next 16 + React 19's own runtime is ~131 KB gzip, over the 130 KB landing budget by itself.
    judgment: { jsGzipBytes: "DECISIONS 2026-11-17 landing JS" },
    accepted: { jsGzipBytes: { max: 162 * 1024, by: C91 } },
  },
  {
    // P1-07 edge case: 50 memberships stay within the LCP budget (one fixed-count read, server-rendered list).
    name: "wallet-50",
    task: "P1-07",
    budget: CUSTOMER_BUDGET,
    accepted: { jsGzipBytes: { max: 194 * 1024, by: C91 } },
    setup: async (request) => {
      const session = await request.post("/api/test/session", {
        data: { role: "customer" },
        headers: testApiHeaders(),
      });
      expect(session.ok()).toBe(true);
      const { userId } = (await session.json()) as { userId: string };
      const cookie = session
        .headersArray()
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .map((h) => h.value.split(";")[0])
        .join("; ");
      expect(cookie).not.toBe("");
      for (let i = 0; i < 50; i++) {
        const res = await request.post("/api/test/shop", {
          data: {
            status: "active",
            name: `Wallet Shop ${String(i + 1)}`,
            details: true,
            programme: true,
            memberUserId: userId,
            member: { purchaseCount: i % 7, progressGold: (i * 37) % 1000, ingotsCompleted: i % 3 },
          },
          headers: testApiHeaders(),
        });
        expect(res.ok()).toBe(true);
      }
      return { path: "/wallet", headers: { cookie } };
    },
  },
  {
    // P1-18 AC6 (C-91): a member's shop page (header, Gold Vault, rewards ready, history with receipts).
    name: "shop-page",
    task: "P1-18",
    budget: CUSTOMER_BUDGET,
    accepted: { jsGzipBytes: { max: 219.5 * 1024, by: C91 } },
    setup: async (request) => {
      const session = await request.post("/api/test/session", {
        data: { role: "customer" },
        headers: testApiHeaders(),
      });
      expect(session.ok()).toBe(true);
      const { userId } = (await session.json()) as { userId: string };
      const cookie = session
        .headersArray()
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .map((h) => h.value.split(";")[0])
        .join("; ");
      expect(cookie).not.toBe("");
      const res = await request.post("/api/test/shop", {
        data: {
          status: "active",
          name: "Brew & Bloom Café",
          details: true,
          programme: "sample",
          memberUserId: userId,
          member: { purchaseCount: 3, progressGold: 720 },
          visits: 3,
        },
        headers: testApiHeaders(),
      });
      expect(res.ok()).toBe(true);
      const { shopId } = (await res.json()) as { shopId: string };
      return { path: `/shops/${shopId}`, headers: { cookie } };
    },
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
  // Tags are literal for the title check: landing is P1-02, wallet-50 is P1-07 (`route.task`).
  test(`[P1-02][P1-07][P1-18] Lighthouse mobile: ${route.task} ${route.name} within DESIGN §12 budget`, async ({
    request,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const { path: routePath, headers = {} } = await route.setup(request);
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
        extraHeaders: { ...clientHeaders(), ...headers },
      });
      if (!result) throw new Error("Lighthouse returned no result");
      const { lhr } = result;
      expect(lhr.runtimeError, lhr.runtimeError?.message).toBeUndefined();
      expect(lhr.configSettings.formFactor).toBe("mobile");
      expect(lhr.configSettings.throttlingMethod).toBe("simulate");

      // Initial JS: the scripts this route's HTML loads (lazy chunks such as Sentry-on-idle excluded).
      const html = await request.get(routePath, { headers: { ...clientHeaders(), ...headers } });
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

      const unaccepted = verdict.metrics.filter((m) => {
        const ceiling = route.accepted?.[m.metric];
        if (ceiling && m.value <= ceiling.max) return false;
        return m.status === "fail" || (m.status === "judgment" && !route.judgment?.[m.metric]);
      });
      expect(
        unaccepted.map((m) => m.metric),
        line,
      ).toEqual([]);
    } finally {
      await browser.close();
    }
  });
}
