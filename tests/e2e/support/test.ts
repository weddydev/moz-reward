/**
 * Shared Playwright fixtures (TESTING §6, §8). Every spec imports `test`/`expect` from here, never
 * from @playwright/test directly, so the console/network guard is always on.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import type { ActorRole } from "@/server/testing/factories";
import { countEmailsTo, firstLink, latestEmailTo } from "../../support/mailpit";

export { expect };

export type GuardProblem = {
  kind: "pageerror" | "console" | "requestfailed" | "http5xx";
  text: string;
};

type Options = {
  /** Problems this test expects (e.g. a deliberate 500). Matched against `kind: text`. */
  guardAllow: RegExp[];
};

type SignedIn = { userId: string; email: string; shopId: string | null; role: ActorRole };
type CreatedUser = { userId: string; email: string; password: string; totpSecret?: string };

/** Unique, undeliverable address (`.invalid` TLD); Mailpit still captures it. Specs never import server code. */
export const uniqueEmail = (label: string): string =>
  `${label}.${randomUUID().slice(0, 12)}@test.moz.invalid`;

type Fixtures = {
  guard: { problems: GuardProblem[] };
  signInAs: (role: ActorRole, opts?: { shopId?: string }) => Promise<SignedIn>;
  /** A password user with no session, via `/api/test/user` (for flows that sign in through the UI). */
  createUser: (label?: string, opts?: { totp?: boolean }) => Promise<CreatedUser>;
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

  // Unhandled promise rejections don't always surface as `pageerror` (WebKit); re-raise them as errors.
  page: async ({ page }, provide) => {
    await page.addInitScript(() => {
      window.addEventListener("unhandledrejection", (e) => {
        const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
        console.error(`Unhandled rejection: ${reason}`);
      });
    });
    await provide(page);
  },

  guard: [
    async ({ page, guardAllow }, provide, testInfo) => {
      const problems: GuardProblem[] = [];
      watch(page, problems);
      await provide({ problems });
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
      const res = await page.request.post("/api/test/session", { data: { role, ...opts } });
      expect(res.status(), `test session for ${role}`).toBe(200);
      return (await res.json()) as SignedIn;
    });
  },

  createUser: async ({ request }, provide) => {
    await provide(async (label = "e2e-user", opts = {}) => {
      const res = await request.post("/api/test/user", { data: { label, ...opts } });
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
      const res = await page.request.get("/api/test/push");
      expect(res.status()).toBe(200);
      return (await res.json()) as Awaited<ReturnType<Fixtures["pushes"]>>;
    });
  },
});
