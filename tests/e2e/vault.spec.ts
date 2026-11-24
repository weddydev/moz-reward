import { type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { throttleCpu, LONG_TASK_MS, medianFrameRate } from "./support/cpu-throttle";
import { expect, test, testApiHeaders } from "./support/test";

// P1-08 on the production build: the Ingot (static + pour), the Gold Vault page, and the carried items — the
// loyalty settings preview (C-59), the landing reward preview (C-50) and the join sheet loaded on demand (C-64).
// Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-08).

type Seeded = { shopId: string; shopCode: string };

async function seedVault(
  request: APIRequestContext,
  userId: string | null,
  member: { progressGold?: number; ingotsCompleted?: number } = {},
  programme: boolean | "sample" = "sample",
): Promise<Seeded> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: "Brew & Bloom Café",
      details: true,
      programme,
      ...(userId ? { memberUserId: userId, member: { purchaseCount: 5, ...member } } : {}),
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Seeded;
}

const ingot = (page: Page) => page.locator(".ingot-pour");

type MidPour = "scroll-away" | "tab-hidden" | "reduce-toggle" | "tap";

/** Counts `finish()` calls on the ingot's animations (from before any page script), so a test can prove the pour
 *  was cut to its end by the component, not left to end on its own. */
async function recordFinishes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __finished: number };
    w.__finished = 0;
    // Kept unbound on purpose: the wrapper calls it with each animation as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const real = Animation.prototype.finish;
    Animation.prototype.finish = function (this: Animation) {
      if ((this.effect as KeyframeEffect | null)?.target?.closest(".ingot-pour")) w.__finished += 1;
      real.call(this);
    };
  });
}

/**
 * Waits for the pour to start, then does `act` in the page at once and reports how many rendering frames it took
 * to land, how many pour animations the component finished early, and the wall time (for the report). Frames,
 * not milliseconds: "at once" means a frame or two, and a starved CI browser can stretch two frames past 600 ms
 * (runs 44689683099, 44723422284). Needs `recordFinishes` before the page loads.
 */
async function landAfter(
  page: Page,
  act: MidPour,
): Promise<{ frames: number; ms: number; finished: number }> {
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "run");
  return page.evaluate(async (step) => {
    const el = document.querySelector(".ingot-pour");
    if (!el) throw new Error("no ingot");
    const w = window as unknown as { __finished: number };
    w.__finished = 0;
    const t0 = performance.now();
    if (step === "scroll-away") window.scrollTo(0, document.documentElement.scrollHeight);
    if (step === "tab-hidden") {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    }
    if (step === "reduce-toggle") document.documentElement.dataset.reduceMotion = "true";
    if (step === "tap") el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    let frames = 0;
    while (el.getAttribute("data-ingot-state") !== "done") {
      if (performance.now() - t0 > 2_000) throw new Error("the pour never landed");
      await new Promise(requestAnimationFrame);
      frames += 1;
    }
    return { frames, ms: performance.now() - t0, finished: w.__finished };
  }, act);
}

type Pour = { part: string; end: number };

/**
 * Records every animation started on an ingot part, from before any page script and again on each load. Reading
 * `document.getAnimations()` after the fact races the 0.5 s rise: a starved runner can finish it first (WebKit,
 * run 44689683099: no animations found).
 */
async function recordPours(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pours: Pour[] };
    w.__pours = [];
    // Kept unbound on purpose: the wrapper calls it with each element as `this`.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const real = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const a = real.apply(this, args);
      const part = this.getAttribute("data-ingot-part");
      if (part) w.__pours.push({ part, end: Number(a.effect?.getComputedTiming().endTime ?? 0) });
      return a;
    };
  });
}
const pours = (page: Page): Promise<Pour[]> =>
  page.evaluate(() => (window as unknown as { __pours: Pour[] }).__pours);

/** Pour animations still running on the ingot's parts (the endless wave on the liquid's surface is not one). */
const running = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (a) =>
            (a.effect as KeyframeEffect | null)?.target?.closest(".ingot-pour") &&
            a.playState === "running" &&
            Number.isFinite(a.effect?.getComputedTiming().endTime),
        ).length,
  );

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P1-08] gold vault: DESIGN sample data, mystery hidden, tiers, shelf, how it works", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, {
    progressGold: 720,
    ingotsCompleted: 2,
  });
  await page.goto(`/vault/${shopId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Your Gold Vault" })).toBeVisible();
  await expect(page.getByRole("img", { name: "720 of 1,000 gold, 72%" })).toBeAttached();
  await expect(page.getByTestId("vault-gold")).toHaveText("720 / 1,000 gold");
  await expect(page.getByTestId("vault-percent")).toHaveText("72%");

  const track = page.getByRole("list", { name: "Rewards in this ingot" });
  await expect(track.getByRole("listitem")).toHaveText([
    "25% Bonus 50 gold, reached",
    "50% Free pastry, reached",
    "75% Mystery reward, next",
    "100% Free coffee & cake, not reached yet",
  ]);
  // A mystery reward's text never reaches the browser before it is reached.
  expect(await page.content()).not.toContain("Secret brownie");

  await expect(page.getByTestId("vault-streak")).toContainText("+50 bonus gold");
  const tier = page.getByTestId("vault-tier");
  await expect(tier.locator("[aria-current]")).toContainText("Silver");
  await expect(tier).toContainText("3 more ingots to Gold");
  await expect(page.getByTestId("vault-shelf")).toContainText("2 ingots collected");
  await expect(page.getByTestId("vault-rewards")).toContainText("Nothing to redeem yet");
  await expect(page.getByTestId("vault-how")).toContainText("Collect 100 gold on every visit.");

  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    await shoot(`vault-${String(width)}`);
  }

  // Back to the shop page, which links here (P1-09 turns that into the Vault card).
  await page.getByTestId("vault-back").click();
  await expect(page).toHaveURL(`/shops/${shopId}`);
  await page.getByTestId("shop-vault-link").click();
  await expect(page).toHaveURL(`/vault/${shopId}`);
});

test("[P1-08] gold vault: members only, and a shop without a programme says so", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const other = await seedVault(page.request, null);
  // Same not-found page as /shops/[id] (P1-04): streamed, so the status may already be 200.
  for (const path of process.env.ONLY_PATH === "bad"
    ? ["/vault/not-a-uuid"]
    : process.env.ONLY_PATH === "other"
      ? [`/vault/${other.shopId}`]
      : [`/vault/${other.shopId}`, "/vault/not-a-uuid"]) {
    const res = await page.goto(path);
    expect([200, 404], path).toContain(res?.status());
    await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
    expect((await res?.text()) ?? "", path).not.toContain("Brew &amp; Bloom");
  }

  const bare = await seedVault(page.request, me.userId, {}, false);
  await page.goto(`/vault/${bare.shopId}`);
  await expect(page.getByTestId("vault-not-set-up")).toContainText("Rewards not set up yet");
});

test("[P1-08] [PD-10] pour: 200 ms after it shows, 0.9 s with the stream on the first view, a 0.5 s rise later in the session", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
  await recordPours(page);
  await page.goto(`/vault/${shopId}`);
  await expect(ingot(page)).toHaveAttribute("data-ingot-kind", "pour");
  const pourParts = await pours(page);
  expect(pourParts.map((p) => p.part)).toContain("stream");
  // The reference's timing (PD-10): the liquid lands 200 + 900 ms in, the glint follows for 700 ms.
  expect(pourParts.find((p) => p.part === "fill")?.end).toBe(1_100);
  expect(Math.max(...pourParts.map((p) => p.end))).toBe(1_800);
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
  // The resting picture is the static one: liquid at 72%, nothing hidden or running.
  expect(await running(page)).toBe(0);
  await expect(ingot(page).locator('[data-ingot-part="fill"]')).toHaveCSS("opacity", "1");

  await page.reload();
  await expect(ingot(page)).toHaveAttribute("data-ingot-kind", "rise");
  const riseParts = await pours(page);
  expect(riseParts.length).toBeGreaterThan(0);
  expect(riseParts.map((p) => p.part)).not.toContain("stream");
  expect(riseParts.find((p) => p.part === "fill")?.end).toBe(700);
});

test("[P1-08] pour never blocks: a tap on a link mid-pour navigates at once, scrolling works", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/vault/${shopId}`);
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "run");
  const scrolled = await page.evaluate(() => {
    window.scrollBy(0, 200);
    return window.scrollY;
  });
  expect(scrolled).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.reload(); // a fresh rise, so a run is in progress again
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "run");
  await page.getByTestId("vault-back").click();
  await expect(page).toHaveURL(`/shops/${shopId}`, { timeout: 2_000 });
});

test.describe("[P1-08] pour edge cases land on the final state at once", () => {
  for (const [name, act] of [
    ["scrolled out of view", "scroll-away"],
    ["tab hidden", "tab-hidden"],
    ["Reduce animations switched on in Me", "reduce-toggle"],
    ["a tap on the ingot (skip)", "tap"],
  ] as const) {
    test(name, async ({ page, signInAs }) => {
      const me = await signInAs("customer");
      const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
      await page.setViewportSize({ width: 390, height: 700 });
      await recordFinishes(page);
      await page.goto(`/vault/${shopId}`);
      const landed = await landAfter(page, act);
      // At once = a frame or two: one for the observer or event to fire, one for React to commit, one spare
      // (measured 1–3 on Chromium, WebKit and iPhone, 20 Nov). Frames, not ms: a starved runner stretches two
      // frames past 600 ms (see landAfter). And never the rest of the pour: the component cut it short (finish()).
      const report = JSON.stringify(landed);
      expect(landed.frames, report).toBeLessThanOrEqual(3);
      expect(landed.finished, report).toBeGreaterThan(0);
      expect(await running(page)).toBe(0);
      // No catch-up later: back in view, nothing pours again on this page.
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      expect(await running(page)).toBe(0);
      await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
    });
  }

  test("system reduced motion switched on mid-pour", async ({ page, signInAs }) => {
    const me = await signInAs("customer");
    const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
    await page.goto(`/vault/${shopId}`);
    await expect(ingot(page)).toHaveAttribute("data-ingot-state", "run");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done", { timeout: 500 });
    expect(await running(page)).toBe(0);
  });
});

test("[P1-08] reduced motion: the static ingot, no pour at all", async ({ page, signInAs }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
  await page.goto(`/vault/${shopId}`);
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
  await expect(ingot(page)).not.toHaveAttribute("data-ingot-kind", /.+/);
  await expect(ingot(page).locator('[data-ingot-part="fill"]')).toHaveCSS("opacity", "1");
  expect(await running(page)).toBe(0);
});

test("[P1-08] progress 0: an empty mould, no wave and nothing to pour", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, { progressGold: 0 });
  await page.goto(`/vault/${shopId}`);
  await expect(page.getByRole("img", { name: "0 of 1,000 gold, 0%" })).toBeAttached();
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
  await expect(ingot(page).locator("[data-ingot-part='fill']")).toHaveCount(0);
  await expect(ingot(page).locator("[data-ingot-part='wave']")).toHaveCount(0);
  await expect(page.getByTestId("vault-shelf")).toContainText(
    "Your first ingot fills at 1,000 gold.",
  );
});

/**
 * The pour at 4× CPU (the CI runner as the reference device). Two tests over the same run (DECISIONS 22 Nov):
 * the pour lands with no long task over 50 ms (DESIGN §12) on every push (@perf); its frame rate on CI's fixed
 * runners nightly and in gate:phase (@fps).
 */
async function pourRun(
  page: Page,
  info: TestInfo,
  signInAs: (role: "customer") => Promise<{ userId: string }>,
) {
  const me = await signInAs("customer");
  const { shopId } = await seedVault(page.request, me.userId, { progressGold: 720 });
  // The ingot's "first on screen" observer is held until the page has settled, so the pour starts on cue. Loading
  // scrolled down to "How it works" didn't keep it out of view before hydration (run 44723422284: already done).
  await page.addInitScript(() => {
    const w = window as unknown as { __releaseIngot: () => void; __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: "longtask", buffered: false });
    const Real = window.IntersectionObserver;
    const held = new Set<IntersectionObserver>();
    const targets = new WeakMap<IntersectionObserver, Element[]>();
    let holding = true;
    window.IntersectionObserver = class extends Real {
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super((entries, observer) => {
          if (holding && entries.some((e) => e.target.closest(".ingot-pour"))) held.add(observer);
          else cb(entries, observer);
        }, options);
      }
      override observe(target: Element): void {
        targets.set(this, [...(targets.get(this) ?? []), target]);
        super.observe(target);
      }
    };
    w.__releaseIngot = () => {
      holding = false;
      for (const observer of held) {
        for (const t of targets.get(observer) ?? []) {
          observer.unobserve(t);
          observer.observe(t); // a fresh first notification, delivered now
        }
      }
    };
  });
  await page.setViewportSize({ width: 390, height: 500 });
  const { cdp } = await throttleCpu(page, info);
  await page.goto(`/vault/${shopId}`);
  await page.waitForLoadState("networkidle");
  await expect(ingot(page)).toHaveAttribute("data-ingot-state", "pending");
  // Release the ingot's observer and record every frame until the pour has landed.
  const run = await page.evaluate(async () => {
    const el = document.querySelector(".ingot-pour");
    if (!el) throw new Error("no ingot");
    const w = window as unknown as { __releaseIngot: () => void; __long: number[] };
    w.__long = []; // only what happens while the pour plays
    w.__releaseIngot();
    const times: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 3_000) {
      times.push(await new Promise<number>(requestAnimationFrame));
      if (times.length > 3 && el.getAttribute("data-ingot-state") === "done") break;
    }
    return { times, state: el.getAttribute("data-ingot-state"), long: [...w.__long] };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const frames = run.times;
  const gaps = frames.slice(1).map((t, i) => t - (frames[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const fps = (1000 * gaps.length) / gaps.reduce((s, g) => s + g, 0);
  const longest = Math.max(0, ...run.long);
  info.annotations.push({
    type: "pour frames",
    description: `${String(frames.length)} frames, ${fps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, long tasks ${String(run.long.length)} (max ${longest.toFixed(0)} ms)`,
  });
  return { frames, state: run.state, fps, p95, longest };
}

test("[P1-08] the pour lands under 4× CPU throttling with no long task over 65 ms @perf", async ({
  page,
  signInAs,
  browserName,
}) => {
  // By engine, not project name: CI's @perf step runs pixel7 + desktop1440 (PD-A code review M1).
  test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  const run = await pourRun(page, test.info(), signInAs);
  expect(run.state).toBe("done");
  expect(run.frames.length).toBeGreaterThan(20);
  expect(run.longest).toBeLessThanOrEqual(LONG_TASK_MS);
});

test("[P1-08] the pour holds 60 fps under 4× CPU throttling @fps", async ({
  page,
  signInAs,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  // Median of 3 runs (process fix 3): the bounds are unchanged, one slow moment on a shared runner no longer decides.
  const m = await medianFrameRate(test.info(), () => pourRun(page, test.info(), signInAs));
  expect(m.fps).toBeGreaterThanOrEqual(55);
  expect(m.p95).toBeLessThanOrEqual(20);
});

test("[P1-08] a progress change after load is announced in a polite live region", async ({
  page,
}) => {
  await page.goto("/dev/motion");
  const live = page.getByTestId("ingot-live");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(""); // nothing announced on load
  // Wait until the demos have hydrated (as motion-primitives' `openGallery` does): a change made before that
  // is lost, since React hydrates over it (WebKit on Windows hydrates late: the ingot kept 720 while the
  // slider read 500).
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("button", { name: "Open modal", exact: true })).toBeEnabled();
  await page.getByTestId("ingot-demo-gold").fill("500");
  await expect(live).toHaveText("500 of 1,000 gold, 50%");
});

test("[P1-08] C-50: the shop landing previews the first reward with a static ingot", async ({
  page,
  shoot,
}) => {
  const { shopCode } = await seedVault(page.request, null);
  await page.goto(`/s/${shopCode}`);
  const card = page.getByTestId("landing-reward");
  await expect(card).toContainText("First reward");
  await expect(card).toContainText("Bonus 50 gold");
  await expect(card).toContainText("at 250 gold");
  await expect(card).toContainText("Free coffee & cake");
  await expect(card).toContainText("at 1,000 gold");
  await expect(card.locator("svg[data-ingot]")).toHaveAttribute("aria-hidden", "true");
  expect(await page.content()).not.toContain("Secret brownie");
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    await shoot(`landing-reward-${String(width)}`);
  }

  const bare = await seedVault(page.request, null, {}, false);
  await page.goto(`/s/${bare.shopCode}`);
  await expect(page.getByTestId("landing-hours")).toBeVisible();
  await expect(page.getByTestId("landing-reward")).toHaveCount(0);
});

test("[P1-08] C-59: the loyalty settings preview is the real ingot (static)", async ({
  page,
  signInAs,
  shoot,
}) => {
  await signInAs("owner");
  await page.goto("/dashboard/loyalty");
  const preview = page.locator("aside svg[data-ingot]");
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-hidden", "true");
  await expect(preview.locator('[data-ingot-part="stream"]')).toHaveCount(0);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await preview.scrollIntoViewIfNeeded();
    await shoot(`loyalty-preview-${String(width)}`, { fullPage: false });
  }
});

test("[P1-08] C-64: the join sheet's code loads only when it is wanted", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  const { shopCode } = await seedVault(page.request, null);
  await page.goto(`/s/${shopCode}`);
  await page.waitForLoadState("networkidle");
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(r.url());
  });
  await expect(page.getByTestId("join-form")).toHaveCount(0);
  await page.getByTestId("landing-collect").click();
  await expect(page.getByTestId("join-form")).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
});

test.describe("[P1-08] ingot visual snapshots (static mode)", { tag: "@visual" }, () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one browser holds the baseline");
  });
  for (const width of [390, 1440] as const) {
    test(`vault looks as approved at ${String(width)}px`, async ({ page, signInAs }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      const me = await signInAs("customer");
      const { shopId } = await seedVault(page.request, me.userId, {
        progressGold: 720,
        ingotsCompleted: 2,
      });
      await page.goto(`/vault/${shopId}`);
      await expect(ingot(page)).toHaveAttribute("data-ingot-state", "done");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`vault-${String(width)}.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: true,
        maxDiffPixelRatio: 0.002,
      });
    });
  }
});
