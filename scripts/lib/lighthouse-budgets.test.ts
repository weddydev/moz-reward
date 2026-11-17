import { describe, expect, it } from "vitest";
import {
  JUDGMENT_MARGIN,
  LANDING_BUDGET,
  evaluateBudget,
  formatVerdict,
  htmlScriptUrls,
} from "./lighthouse-budgets";

const ok = { lcpMs: 1800, cls: 0.01, jsGzipBytes: 90_000 };

describe("[P1-02] Lighthouse budgets", () => {
  it("[P1-02] the landing budget is DESIGN §12's: LCP 2.5 s, CLS 0.05, initial JS 130 KB gzip", () => {
    expect(LANDING_BUDGET).toEqual({ lcpMs: 2500, cls: 0.05, jsGzipBytes: 130 * 1024 });
    expect(JUDGMENT_MARGIN).toBe(0.15);
  });

  it("[P1-02] all metrics within budget → pass", () => {
    const v = evaluateBudget(ok, LANDING_BUDGET);
    expect(v.status).toBe("pass");
    expect(v.metrics.every((m) => m.status === "pass")).toBe(true);
  });

  it("[P1-02] exactly on the budget passes (≤, not <)", () => {
    expect(
      evaluateBudget({ lcpMs: 2500, cls: 0.05, jsGzipBytes: 130 * 1024 }, LANDING_BUDGET).status,
    ).toBe("pass");
  });

  it("[P1-02] up to 15% over → judgment (needs a DECISIONS line), not a pass", () => {
    const v = evaluateBudget({ ...ok, jsGzipBytes: Math.floor(130 * 1024 * 1.15) }, LANDING_BUDGET);
    expect(v.status).toBe("judgment");
    expect(v.metrics.find((m) => m.metric === "jsGzipBytes")?.status).toBe("judgment");
  });

  it("[P1-02] more than 15% over → fail, and a fail outranks a judgment", () => {
    const v = evaluateBudget({ lcpMs: 2600, cls: 0.06, jsGzipBytes: 90_000 }, LANDING_BUDGET);
    expect(v.metrics.find((m) => m.metric === "lcpMs")?.status).toBe("judgment");
    expect(v.metrics.find((m) => m.metric === "cls")?.status).toBe("fail");
    expect(v.status).toBe("fail");
  });

  it("[P1-02] a missing metric (NaN) fails: an unmeasured number is never a pass", () => {
    expect(evaluateBudget({ ...ok, lcpMs: Number.NaN }, LANDING_BUDGET).status).toBe("fail");
  });

  it("[P1-02] formatVerdict prints each metric against its budget in readable units", () => {
    const line = formatVerdict("landing", evaluateBudget(ok, LANDING_BUDGET));
    expect(line).toContain("landing PASS");
    expect(line).toContain("LCP 1.80 s ≤ 2.50 s");
    expect(line).toContain("CLS 0.010 ≤ 0.050");
    expect(line).toContain("JS 87.9 KB ≤ 130.0 KB gzip");
  });

  it("[P1-02] initial scripts = the <script src> tags in the HTML (lazy and nomodule excluded), absolute, unique", () => {
    const html = [
      '<script src="/_next/static/chunks/a.js" async=""></script>',
      "<script src='/_next/static/chunks/a.js' async></script>",
      '<script async src="/_next/static/chunks/b.js" nonce="n"></script>',
      '<link rel="stylesheet" href="/_next/static/css/c.css">',
      '<script nonce="n">self.__next_f.push([1,"<script src=\\"/fake.js\\">"])</script>',
      '<SCRIPT SRC="https://example.com/x.js"></SCRIPT>',
      '<script type="application/ld+json">{"src":"/no.js"}</script>',
      '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>',
      "<script nomodule src='/legacy.js'></script>",
    ].join("");
    expect(htmlScriptUrls(html, "http://localhost:3100/s/ABC234?src=qr")).toEqual([
      "http://localhost:3100/_next/static/chunks/a.js",
      "http://localhost:3100/_next/static/chunks/b.js",
      "https://example.com/x.js",
    ]);
  });
});
