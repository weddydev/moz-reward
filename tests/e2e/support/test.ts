/**
 * Shared Playwright fixtures (TESTING §6, §8). Every spec imports `test`/`expect` from here, never
 * from @playwright/test directly, so the console/network guard is always on.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import type { ActorRole } from "@/server/testing/factories";
import { TEST_API_HEADER, testApiToken } from "../../../src/lib/test-api-token";
import { countEmailsTo, firstLink, latestEmailTo } from "../../support/mailpit";

export { expect };

/** Header every `/api/test/*` call needs (SEC-L4); the Playwright process shares the server's AUTH_SECRET. */
export function testApiHeaders(): Record<string, string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set: run pnpm setup:env");
  return { [TEST_API_HEADER]: testApiToken(secret) };
}

export type GuardProblem = {
  kind: "pageerror" | "console" | "requestfailed" | "http5xx" | "axe";
  text: string;
};

/** The accessibility bar every page meets (DESIGN/ENGINEERING §1): WCAG 2.2 AA, serious + critical. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/**
 * axe scan of the page a test ends on (P0-14 guard). Skipped for pages outside the app (about:blank in
 * API-only tests, external sites) and for tests that already failed (their own error is the one to read).
 */
async function axeProblems(page: Page, baseURL: string | undefined): Promise<GuardProblem[]> {
  if (page.isClosed() || !baseURL) return [];
  const url = page.url();
  if (!url.startsWith(new URL(baseURL).origin)) return [];
  // Dynamic pages stream metadata after the visible content (Next "streaming metadata"), so right after a
  // client navigation <title> can still be empty. Wait for it (2 s cap); a page that never gets one still fails.
  await page
    .waitForFunction(() => document.title !== "", undefined, { timeout: 2000 })
    .catch(() => undefined);
  // Hydration enables controls (disabled until hydrated) and they fade in: wait for it first, else the scan can
  // land mid-fade on a slow runner (CI 42772627338). <html data-hydrated> is set by ApplyPreferences (2 s cap).
  await page
    .waitForFunction(
      // The root marks <html> from its own Suspense boundary, which can hydrate before the page segment; a
      // page whose controls wait for hydration marks itself `data-hydrating` until then (CI 43005714982:
      // axe saw /dev/ui's scroll rows with every control still disabled).
      () =>
        document.documentElement.dataset.hydrated === "true" &&
        !document.querySelector("[data-hydrating]"),
      undefined,
      { timeout: 2000 },
    )
    .catch(() => undefined);
  // Measure the settled page: a scan during a transition (e.g. a button fading from its pre-hydration
  // disabled opacity to 1) reads blended colours and reports false contrast failures. Finite animations only
  // (spinners loop forever), capped at 1 s.
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        ),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]),
    )
    .catch(() => undefined);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      kind: "axe" as const,
      text: `${v.id} on ${new URL(url).pathname}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    }));
}

type Options = {
  /** Problems this test expects (e.g. a deliberate 500). Matched against `kind: text`. */
  guardAllow: RegExp[];
  /** P0-13: the analytics choice already stored when the page opens (null = undecided: the notice shows). */
  analyticsConsent: "granted" | "denied" | null;
};

type SignedIn = {
  userId: string;
  email: string;
  shopId: string | null;
  shopCode: string | null;
  role: ActorRole;
};
type CreatedUser = { userId: string; email: string; password: string; totpSecret?: string };

/**
 * Opens an emailed sign-in link the way a person does (P0-19): the link shows the confirm page, and the token
 * is used only when "Sign in" is pressed.
 */
export async function openSignInLink(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Unique, undeliverable address (`.invalid` TLD); Mailpit still captures it. Specs never import server code. */
export const uniqueEmail = (label: string): string =>
  `${label}.${randomUUID().slice(0, 12)}@test.moz.invalid`;

/**
 * A fresh client address (IPv6 documentation range, random /64: limits key IPv6 by its /64). The E2E server trusts X-Forwarded-For the way it does
 * behind Caddy (TRUSTED_PROXY=caddy, P0-19), so per-IP limits run exactly as on staging. Every test gets its
 * own (the `clientIp` fixture); contexts a spec opens itself pass `{ extraHTTPHeaders: clientHeaders() }`.
 */
export const newClientIp = (): string =>
  `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::e2e`;
export const clientHeaders = (ip: string = newClientIp()): Record<string, string> => ({
  "x-forwarded-for": ip,
});

type Fixtures = {
  /** This test's client address, sent as X-Forwarded-For on every page and API request. */
  clientIp: string;
  guard: { problems: GuardProblem[] };
  signInAs: (role: ActorRole, opts?: { shopId?: string }) => Promise<SignedIn>;
  /** A password user with no session, via `/api/test/user` (for flows that sign in through the UI). */
  createUser: (
    label?: string,
    opts?: { totp?: boolean; failedSignIns?: number; admin?: boolean },
  ) => Promise<CreatedUser>;
  /** Freezes the page clock at an ISO instant (Europe/London is the app's zone; pass an explicit offset). */
  freezeTime: (iso: string) => Promise<void>;
  /** Screenshot to `.artifacts/screens/<task-id>/<name>--<project>.png`; returns the path to inspect. */
  shoot: (name: string, opts?: { fullPage?: boolean }) => Promise<string>;
  mail: {
    latestTo: typeof latestEmailTo;
    countTo: typeof countEmailsTo;
    firstLink: typeof firstLink;
  };
  pushes: () => Promise<
    Array<{
      subscription: { endpoint: string };
      payload: { title: string; body: string; url?: string };
    }>
  >;
};

const TASK_ID = /\[((?:P\d|S)-\d{2}|J\d{1,2})\]/;

export function taskIdFrom(info: Pick<TestInfo, "titlePath">): string {
  for (const part of [...info.titlePath].reverse()) {
    const m = TASK_ID.exec(part);
    if (m?.[1]) return m[1];
  }
  return "untagged";
}

const HYDRATION = /hydrat/i;
/** The browser's own echo of a failed resource load; the network listeners below record it precisely (with URL). */
const RESOURCE_ECHO = /^Failed to load resource: the server responded with a status of \d{3}/;

/** Wires listeners that collect every uncaught error, console.error, hydration warning and failed request. */
function watch(page: Page, problems: GuardProblem[]): void {
  page.on("pageerror", (err) => problems.push({ kind: "pageerror", text: err.message }));
  page.on("console", (msg) => {
    const text = msg.text();
    if (RESOURCE_ECHO.test(text)) return;
    if (msg.type() === "error" || (msg.type() === "warning" && HYDRATION.test(text)))
      problems.push({ kind: "console", text });
  });
  page.on("requestfailed", (req) => {
    const reason = req.failure()?.errorText ?? "failed";
    // Navigations/aborts the browser cancels on purpose are not failures.
    if (/ERR_ABORTED|cancelled|NS_BINDING_ABORTED/i.test(reason)) return;
    problems.push({ kind: "requestfailed", text: `${req.method()} ${req.url()} ${reason}` });
  });
  page.on("response", (res) => {
    if (res.status() >= 500)
      problems.push({
        kind: "http5xx",
        text: `${res.status()} ${res.request().method()} ${res.url()}`,
      });
  });
}

export const test = base.extend<Fixtures & Options>({
  guardAllow: [[], { option: true }],

  clientIp: async ({}, provide) => {
    await provide(newClientIp());
  },
  extraHTTPHeaders: async ({ extraHTTPHeaders, clientIp }, provide) => {
    await provide({ ...extraHTTPHeaders, ...clientHeaders(clientIp) });
  },

  analyticsConsent: ["denied", { option: true }],

  // Unhandled promise rejections don't always surface as `pageerror` (WebKit); re-raise them as errors.
  page: async ({ page, analyticsConsent, baseURL }, provide) => {
    // P0-13: a stored analytics choice, so the cookie notice doesn't sit over other specs' controls.
    // The consent spec sets `analyticsConsent: null` to start undecided.
    if (analyticsConsent && baseURL) {
      await page.context().addCookies([
        {
          name: "moz_consent",
          value: `analytics-v1-${analyticsConsent}`,
          url: baseURL,
          sameSite: "Lax",
        },
      ]);
    }
    await page.addInitScript(() => {
      window.addEventListener("unhandledrejection", (e) => {
        const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
        console.error(`Unhandled rejection: ${reason}`);
      });
    });
    await provide(page);
  },

  guard: [
    async ({ page, guardAllow, baseURL }, provide, testInfo) => {
      const problems: GuardProblem[] = [];
      watch(page, problems);
      await provide({ problems });
      // Only when the body itself passed (not `=== expectedStatus`: a `test.fail()` self-test expects
      // "failed", and its axe check is exactly what must run).
      if (testInfo.status === "passed") problems.push(...(await axeProblems(page, baseURL)));
      const unexpected = problems.filter(
        (p) => !guardAllow.some((re) => re.test(`${p.kind}: ${p.text}`)),
      );
      if (unexpected.length > 0) {
        await testInfo.attach("console-network-guard", {
          body: JSON.stringify(unexpected, null, 2),
          contentType: "application/json",
        });
        throw new Error(
          `Console/network guard: ${unexpected.length} problem(s)\n${unexpected.map((p) => `  - ${p.kind}: ${p.text}`).join("\n")}`,
        );
      }
    },
    { auto: true },
  ],

  signInAs: async ({ page }, provide) => {
    await provide(async (role, opts = {}) => {
      // page.request shares the browser context's cookie jar, so the session cookie applies to `page`.
      const res = await page.request.post("/api/test/session", {
        data: { role, ...opts },
        headers: testApiHeaders(),
      });
      expect(res.status(), `test session for ${role}`).toBe(200);
      return (await res.json()) as SignedIn;
    });
  },

  createUser: async ({ request }, provide) => {
    await provide(async (label = "e2e-user", opts = {}) => {
      const res = await request.post("/api/test/user", {
        data: { label, ...opts },
        headers: testApiHeaders(),
      });
      expect(res.status(), "test user").toBe(200);
      return (await res.json()) as CreatedUser;
    });
  },

  freezeTime: async ({ page }, provide) => {
    await provide(async (iso) => {
      await page.clock.setFixedTime(new Date(iso));
    });
  },

  shoot: async ({ page }, provide, testInfo) => {
    await provide(async (name, opts = {}) => {
      const dir = path.join(".artifacts", "screens", taskIdFrom(testInfo));
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${name}--${testInfo.project.name}.png`);
      // caret "initial": hiding the caret writes inline styles onto inputs, which React reports as a hydration
      // mismatch when the shot is taken before the page segment has hydrated. Screenshots must not touch the DOM.
      await page.screenshot({
        path: file,
        fullPage: opts.fullPage ?? true,
        animations: "disabled",
        caret: "initial",
      });
      return file;
    });
  },

  mail: async ({}, provide) => {
    await provide({ latestTo: latestEmailTo, countTo: countEmailsTo, firstLink });
  },

  pushes: async ({ page }, provide) => {
    await provide(async () => {
      const res = await page.request.get("/api/test/push", { headers: testApiHeaders() });
      expect(res.status()).toBe(200);
      return (await res.json()) as Awaited<ReturnType<Fixtures["pushes"]>>;
    });
  },
});
