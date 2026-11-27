import { gzipSync } from "node:zlib";
import { type APIRequestContext, type Page, type TestInfo } from "@playwright/test";
import { LONG_TASK_MS, medianFrameRate, throttleCpu } from "./support/cpu-throttle";
import { expect, test, testApiHeaders } from "./support/test";

// P1-15 celebrations on the production build (DESIGN §8.2, §8.4, §8.5): an approval while the app is open plays
// "points credited" from the stream (`/api/test/relay-realtime` does the worker's publish; no worker in E2E), an
// unseen approval plays on app open, and the server's `seen_at` makes each play once (a second tab, a reload).
// A filled ingot chains into "reward unlocked"; a tap skips; reduced motion shows the end state; opening a
// receipt prints it. Chunks ≤ 35 KB gzip; no long task over 65 ms under the calibrated 4× CPU (@perf); 60 fps
// (@fps). Screenshots at 320, 390 and 1440 (.artifacts/screens/P1-15).

test.use({ realtime: true });

const SHOP = "Brew & Bloom Café";
/** An approval under parallel workers can take seconds on a laptop. */
const SERVER_MS = 15_000;

/** A shop with the sample programme (+100 gold a visit; milestones 25/50/75) and the user as a member. */
async function seedShop(
  request: APIRequestContext,
  userId: string,
  opts: { progressGold?: number; visits?: number; celebrate?: boolean; name?: string } = {},
): Promise<{ shopId: string; shopCode: string }> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: opts.name ?? SHOP,
      details: true,
      programme: "sample",
      memberUserId: userId,
      member: { purchaseCount: 3, progressGold: opts.progressGold ?? 100 },
      visits: opts.visits ?? 0,
      celebrate: opts.celebrate ?? false,
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string; shopCode: string };
}

/** The owner approves one visit for the member (left unseen); returns the gold it came to. */
async function approveVisit(
  request: APIRequestContext,
  data: { shopId: string; userId: string; amountPence?: number; items?: string[] },
): Promise<{ gold: number; receiptNumber: number }> {
  const res = await request.post("/api/test/approve-visit", { data, headers: testApiHeaders() });
  expect(res.ok(), "approve-visit").toBe(true);
  return (await res.json()) as { gold: number; receiptNumber: number };
}

async function relay(request: APIRequestContext, shopId: string): Promise<number> {
  const res = await request.post("/api/test/relay-realtime", {
    data: { shopId },
    headers: testApiHeaders(),
  });
  expect(res.ok(), `relay-realtime ${String(res.status())}: ${await res.text()}`).toBe(true);
  return ((await res.json()) as { delivered: number }).delivered;
}

/** The host has finished `n` claims (each a server round trip): a moment that would open has opened. */
async function claimsDone(page: Page, n: number): Promise<void> {
  await expect
    .poll(
      async () => Number(await page.getByTestId("celebration-host").getAttribute("data-claims")),
      { timeout: SERVER_MS },
    )
    .toBeGreaterThanOrEqual(n);
}

const moment = (page: Page) => page.getByTestId("celebration");

/** Wholly inside the viewport (the moment's centrepiece is seen without scrolling, down to 320 × 640). */
async function expectInView(page: Page, target: ReturnType<Page["locator"]>): Promise<void> {
  const box = await target.boundingBox();
  const view = page.viewportSize();
  expect(box && view, "box and viewport").toBeTruthy();
  if (!box || !view) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
}

test("[P1-15] gold approved while the app is open plays from the stream, once; Done closes it", async ({
  page,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  await expect(page.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
  await claimsDone(page, 1);
  await expect(moment(page)).toHaveCount(0); // nothing unseen yet

  const { gold } = await approveVisit(page.request, {
    shopId,
    userId: me.userId,
    amountPence: 840,
    items: ["Flat white"],
  });
  expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);

  const m = moment(page);
  await expect(m).toBeVisible({ timeout: SERVER_MS });
  const dialog = page.getByRole("dialog", { name: "Gold added" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${SHOP} · £8.40 purchase`);
  // The counting digits are hidden from assistive tech; a hidden copy carries the final number (CountUp).
  const goldLine = page.getByTestId("celebration-gold");
  await expect(goldLine.locator('[aria-hidden="true"]')).toHaveText(String(gold));
  await expect(goldLine.locator(".sr-only")).toHaveText(String(gold));
  await expect(goldLine).toContainText("gold");
  await expect(page.getByTestId("celebration-progress")).toHaveText(
    `${String(Math.floor(((100 + gold) * 100) / 1000))}% full · about ${String(Math.ceil((1000 - 100 - gold) / 100))} more visits`,
  );
  // Everything the animation shows is said once, politely.
  const live = page.getByTestId("celebration-live");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toContainText(`+${String(gold)} gold at ${SHOP}.`);
  // The pour: from the level before (100) to the new one, then done.
  await expect(m).toHaveAttribute("data-state", "poured");
  await expect(m.locator(".ingot-pour")).toHaveAttribute("data-ingot-state", "done", {
    timeout: 5_000,
  });
  await expect(m.getByTestId("reward-card")).toHaveCount(0);
  await expect(page.locator("dialog canvas.m-fx")).toHaveCount(1); // the moment's own particle canvas
  await expectInView(page, m.locator(".m-ingot"));
  await shoot("celebration-credit-390", { fullPage: false });
  await page.setViewportSize({ width: 320, height: 640 });
  await expectInView(page, m.locator(".m-ingot"));
  await shoot("celebration-credit-320", { fullPage: false });

  // Mark the heading, so a failure below says whether it was re-rendered away or focus went elsewhere.
  await page.locator("[data-route-content] h1").evaluate((h) => {
    h.setAttribute("data-probe", "");
  });
  await page.getByTestId("celebration-done").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("dialog canvas.m-fx")).toHaveCount(0);
  // Nothing opened the moment, so focus lands on the page's heading, not <body> (P1-D close QA MINOR 7).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.activeElement;
        const h1 = document.querySelector("[data-route-content] h1");
        if (a && a === h1) return "h1";
        const tag = a ? `<${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ""}>` : "none";
        const id = a?.getAttribute("data-testid") ?? a?.getAttribute("aria-label") ?? "";
        return `${tag} ${id} (h1 ${h1 ? (h1.hasAttribute("data-probe") ? "same node" : "re-rendered") : "gone"})`;
      }),
    )
    .toBe("h1");

  // Seen on the server: a reload claims nothing.
  await page.reload();
  await claimsDone(page, 1);
  await expect(moment(page)).toHaveCount(0);
});

test("[P1-15] an unseen approval plays on app open, in one tab only", async ({
  page,
  context,
  signInAs,
}) => {
  const me = await signInAs("customer");
  await seedShop(page.request, me.userId, { visits: 1, celebrate: true });
  const second = await context.newPage();
  // Two tabs open together: the server hands the moment to exactly one of them.
  await Promise.all([page.goto("/wallet"), second.goto("/wallet")]);
  await Promise.all([claimsDone(page, 1), claimsDone(second, 1)]);
  // The winner's moment arrives with its chunk, just after its claim.
  const shown = async (): Promise<number> =>
    (await moment(page).count()) + (await moment(second).count());
  await expect.poll(shown, { timeout: SERVER_MS }).toBe(1);
  await page.waitForTimeout(1_000);
  expect(await shown()).toBe(1);
  await second.close();
});

test("[P1-18] Escape closes a moment that opened by itself and focus lands on the page's heading", async ({
  page,
  signInAs,
}) => {
  // P1-D close QA MINOR 7: after Done/Escape focus was on <body>, so Tab restarted from the top of the document.
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId, { visits: 1, celebrate: true });
  await page.goto(`/shops/${shopId}`);
  await claimsDone(page, 1);
  await expect(moment(page)).toBeVisible({ timeout: SERVER_MS });
  await page.keyboard.press("Escape");
  await expect(moment(page)).toHaveCount(0);
  const heading = page.getByTestId("member-shop-name");
  await expect(heading).toBeFocused();
  await expect(heading).toHaveAttribute("tabindex", "-1");
});

test("[P1-15] a filled ingot chains into the reward unlocked; reward chime state, card and text", async ({
  page,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  const me = await signInAs("customer");
  await seedShop(page.request, me.userId, { progressGold: 950, visits: 1, celebrate: true });
  for (const [width, height] of [
    [390, 844],
    [320, 640],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (width !== 390) {
      // Each width needs its own unseen approval: a new shop and visit for the same member, seeded with no
      // page of ours open (an open page may claim it first, on a reconnect, and then be navigated away).
      await page.goto("about:blank");
      await seedShop(page.request, me.userId, { progressGold: 950, visits: 1, celebrate: true });
    }
    await page.goto("/wallet");
    const m = moment(page);
    await expect(m).toBeVisible({ timeout: SERVER_MS });
    await expect(m).toHaveAttribute("data-state", "unlocked", { timeout: 8_000 });
    await expect(page.getByTestId("celebration-progress")).toHaveText(
      /^Ingot filled · \d+% into the next one$/,
    );
    const card = m.getByTestId("reward-card");
    await expect(card).toContainText("Your reward is ready");
    await expectInView(page, m.locator(".m-ingot"));
    // The sample's milestones (25/50/75) were never reached, so they unlock with the main reward.
    await expect(card).toContainText(`Free coffee & cake and 3 more · ${SHOP}`);
    await expect(page.getByTestId("celebration-live")).toContainText("4 rewards unlocked.");
    await expect(m.getByTestId("gold-vault")).toHaveAttribute("data-unlocked", "");
    // Wait for the card's flip and the leaves to finish before the picture (the pour itself is skippable). The
    // card's Redeem button (P1-16) shimmers on a loop: endless animations aren't waited for.
    await expect
      .poll(() =>
        card.evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .every(
              (a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity,
            ),
        ),
      )
      .toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(`celebration-reward-${String(width)}`, { fullPage: false });
    await page.getByTestId("celebration-done").click();
    await expect(m).toHaveCount(0);
  }
});

test("[P1-15] the reward card chaining in moves nothing: its place is held from the start (CLS ≤ 0.05)", async ({
  page,
  signInAs,
  browserName,
}) => {
  // P1-D close QA MAJOR: in the bottom sheet the card arriving 2.4 s after opening grew it upwards with no input
  // (CLS 0.215 at 390). The layout-shift API is Chromium's only.
  test.skip(browserName !== "chromium", "layout-shift entries are Chromium-only");
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  const me = await signInAs("customer");
  await seedShop(page.request, me.userId, { progressGold: 950, visits: 1, celebrate: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  const m = moment(page);
  await expect(m).toBeVisible({ timeout: SERVER_MS });
  const before = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  await expect(m).toHaveAttribute("data-state", "unlocked", { timeout: 8_000 });
  const card = m.getByTestId("reward-card");
  await expect(card).toContainText("Your reward is ready");
  await expect(m.getByTestId("reward-card-placeholder")).toHaveCount(0);
  await expect
    .poll(() =>
      card.evaluate((el) =>
        el
          .getAnimations({ subtree: true })
          .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      ),
    )
    .toBe(true);
  const during =
    (await page.evaluate(() => (window as unknown as { __cls: number }).__cls)) - before;
  expect(during, "layout shift while the moment played").toBeLessThanOrEqual(0.05);
});

test("[P1-15] a tap skips to the end state at once", async ({ page }) => {
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("demo-celebrate-reward").click();
  const m = moment(page);
  await expect(m).toBeVisible();
  type Bursts = { __mozFxBursts?: { list: () => Array<{ type: string }>; clear: () => void } };
  // The tap is dispatched in the page, in the same task that reads the state: a Playwright click waits for the
  // line to be stable, and on a loaded CI iPhone14 that wait outlasted the natural unlock (~1.6 s), whose coins
  // are then rightly there (CI 45962514589). The skip handler is a click, not pointerdown, so this is the tap.
  const before = await m.evaluate((el) => {
    (window as unknown as Bursts).__mozFxBursts?.clear();
    const state = el.getAttribute("data-state");
    el.querySelector('[data-testid="celebration-gold"]')?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    return state;
  });
  expect(before, "the tap came before the unlock").not.toBe("unlocked");
  await expect(m).toHaveAttribute("data-state", "unlocked", { timeout: 1_000 });
  await expect(m.locator(".ingot-pour")).toHaveAttribute("data-ingot-state", "done", {
    timeout: 1_000,
  });
  await expect(m.getByTestId("celebration-gold")).toHaveText("+80 gold");
  // A skip before the unlock lands it quietly (P1-15 design LOW 13): no ingot coins, no card leaves. The pour's
  // own sparks may already have flown if the tap came after they started.
  await page.waitForTimeout(500);
  const types = await page.evaluate(() =>
    ((window as unknown as Bursts).__mozFxBursts?.list() ?? [null]).map(
      (b) => b?.type ?? "no hook",
    ),
  );
  expect(types.filter((t) => t !== "spark")).toEqual([]);
  // Done works at any point: closing never waits for an animation.
  await page.getByTestId("celebration-done").click();
  await expect(m).toHaveCount(0);
});

test("[P1-15] reduced motion: the end state with short fades, no particles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("demo-celebrate-reward").click();
  const m = moment(page);
  // The end state (the wait covers the moment's lazy chunk; speed is the @perf spec's job).
  await expect(m).toHaveAttribute("data-state", "unlocked");
  await expect(m.getByTestId("reward-card")).toBeVisible();
  // Every animation in the moment is a ≤ 150 ms fade (DESIGN §7.2); nothing was spawned on the canvas.
  const longest = await m.evaluate((el) =>
    Math.max(
      0,
      ...el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => Number(a.effect?.getComputedTiming().duration ?? 0)),
    ),
  );
  expect(longest).toBeLessThanOrEqual(150);
  const live = await page.evaluate(() => {
    const w = window as unknown as { __mozFx?: { stats: () => { live: number } } };
    return w.__mozFx?.stats().live ?? -1;
  });
  expect(live).toBe(0);

  // The receipt under reduced motion: a fade only, the stamp still (no rise, wipe or press).
  await page.getByTestId("celebration-done").click();
  // Record each animate() call (a 150 ms fade can be over before a later read sees it).
  await page.evaluate(() => {
    const w = window as unknown as { __anims: { cls: string; props: string[] }[] };
    w.__anims = [];
    const original = Object.getOwnPropertyDescriptor(Element.prototype, "animate")
      ?.value as typeof Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const frames = Array.isArray(keyframes) ? keyframes : [];
      w.__anims.push({
        cls: String(this.getAttribute("class")),
        props: [...new Set(frames.flatMap((k) => Object.keys(k)))].filter(
          (p) => !["offset", "easing", "composite"].includes(p),
        ),
      });
      return original.call(this, keyframes, options);
    };
  });
  await page.getByTestId("demo-receipt").click();
  await expect(page.getByTestId("receipt-card")).toBeVisible();
  const calls = await page.evaluate(
    () => (window as unknown as { __anims: { cls: string; props: string[] }[] }).__anims,
  );
  const rm = {
    card: calls.filter((c) => /\bm-receipt\b/.test(c.cls)).map((c) => c.props),
    stamp: calls.filter((c) => c.cls.includes("m-receipt-stamp")).length,
  };
  expect(rm).toEqual({ card: [["opacity"]], stamp: 0 });
});

test("[P1-15] opening a receipt prints it (800 ms clip reveal and stamp); the dashboard print is 400 ms", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId, { visits: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/shops/${shopId}`);
  await claimsDone(page, 1);
  await expect(moment(page)).toHaveCount(0); // a seeded history visit is already seen
  await page.getByTestId("shop-receipt-open").first().click();
  const sheet = page.getByRole("dialog", { name: "Receipt 1" });
  await expect(sheet).toBeVisible();
  const card = sheet.getByTestId("receipt-card");
  await expect(card).toContainText("Digital receipt — not a VAT invoice");
  await expect(card).toContainText(SHOP);
  await expect(card.getByTestId("receipt-number")).toHaveText("1");
  await expect(sheet.getByTestId("receipt-sheet-pdf")).toHaveAttribute(
    "href",
    /^\/api\/me\/receipts\/[0-9a-f-]+\/pdf$/,
  );
  // The animation itself (TESTING §7): the print's keyframes and timing, and the stamp's press.
  const timing = await card.evaluate((el) =>
    el.getAnimations().map((a) => {
      const effect = a.effect as KeyframeEffect;
      return {
        duration: effect.getComputedTiming().duration,
        delay: effect.getComputedTiming().delay,
        frames: effect.getKeyframes().map((k) => [k.transform, k.clipPath]),
      };
    }),
  );
  expect(timing[0]?.duration).toBe(800);
  expect(timing[0]?.delay).toBe(220); // after the sheet has risen (--dur-quiet)
  // Engines serialise the insets differently ("inset(0px 0px 100%)", "inset(0px)"): compare their values.
  const insets = (timing[0]?.frames ?? []).map(([transform, clip]) => [
    transform,
    String(clip).replace(/px/g, "").replace(/\s+/g, " "),
  ]);
  expect(insets[0]?.[0]).toBe("translateY(24px)");
  expect(insets[0]?.[1]).toMatch(/^inset\(0 0 100%( 0)?\)$/);
  expect(insets[1]?.[0]).toBe("none");
  expect(insets[1]?.[1]).toMatch(/^inset\(0( 0 0 0)?\)$/);
  const stamp = await card.locator(".m-receipt-stamp").evaluate((el) =>
    el.getAnimations().map((a) => ({
      duration: a.effect?.getComputedTiming().duration,
      delay: a.effect?.getComputedTiming().delay,
    })),
  );
  expect(stamp).toEqual([{ duration: 160, delay: 220 + 560 }]);
  await expect
    .poll(() =>
      card.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((a) => a.playState === "finished"),
      ),
    )
    .toBe(true);
  await shoot("receipt-sheet-390", { fullPage: false });
  await page.setViewportSize({ width: 320, height: 640 });
  await shoot("receipt-sheet-320", { fullPage: false });

  // The dashboard's version (DESIGN §8.5): 400 ms and no stamp bounce (wired into the approve flow by P2-02).
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.getByTestId("demo-receipt-dashboard").click();
  const dash = page.getByTestId("receipt-card");
  const d = await dash.evaluate((el) => ({
    card: el.getAnimations().map((a) => a.effect?.getComputedTiming().duration),
    stamp: el.querySelector(".m-receipt-stamp")?.getAnimations().length ?? -1,
  }));
  expect(d).toEqual({ card: [400], stamp: 0 });
});

test("[P1-18] a receipt for a long shop name at 320: every word of the title fits its column and the card stays inside the sheet", async ({
  page,
  signInAs,
  shoot,
}) => {
  // P1-D close QA MINOR 6: "Extraordinarily" broke mid-word with no hyphen at 320 (`overflow-wrap: anywhere`
  // alone). The title steps down until its longest word fits, like the shop header's.
  const me = await signInAs("customer");
  const long = "The Extraordinarily Long-Named Neighbourhood Coffee House Ltd";
  const { shopId } = await seedShop(page.request, me.userId, { visits: 1, name: long });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/shops/${shopId}`);
  await claimsDone(page, 1);
  await page.getByTestId("shop-receipt-open").first().click();
  const card = page.getByRole("dialog", { name: "Receipt 1" }).getByTestId("receipt-card");
  const title = card.getByRole("heading", { name: long });
  await expect(title).toBeVisible();
  expect(await page.locator("html").getAttribute("lang")).toBe("en-GB");
  // Every word fits the title's column, so none breaks mid-word (Chromium has no hyphenation dictionary in every
  // build; the title steps down to fit instead, like the shop cover's). Measured unhyphenated, as in shop-page.
  const split = await title.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;hyphens:none";
    el.append(probe);
    const out = (el.firstChild?.textContent ?? "").split(/\s+/).filter((w) => {
      probe.textContent = w;
      return probe.getBoundingClientRect().width > el.clientWidth;
    });
    probe.remove();
    return { out, size: parseFloat(getComputedStyle(el).fontSize) };
  });
  expect(split.out, "words split at 320").toEqual([]);
  expect(split.size).toBeGreaterThanOrEqual(14);
  await expect
    .poll(() =>
      card.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((a) => a.playState === "finished"),
      ),
    )
    .toBe(true);
  const fits = await card.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const t = el.querySelector("h3")?.getBoundingClientRect();
    return {
      page: document.documentElement.scrollWidth <= window.innerWidth,
      title: !!t && t.right <= box.right + 0.5,
      card: box.right <= window.innerWidth + 0.5,
    };
  });
  expect(fits).toEqual({ page: true, title: true, card: true });
  await shoot("receipt-sheet-long-name-320", { fullPage: false });
});

test("[P1-15] the moment is its own chunk, ≤ 35 KB gzip, fetched at idle before any moment", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "one engine measures the shipped bytes");
  const scripts: Promise<{ moment: boolean; gzip: number }>[] = [];
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/_next/static/") || !url.endsWith(".js")) return;
    scripts.push(
      res
        .body()
        .then((b) => ({ moment: b.includes("celebration-done"), gzip: gzipSync(b).length })),
    );
  });
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  // The chunk comes from an idle callback with no timeout, which under load can fire after `networkidle` settles
  // (KI-49): wait until it has arrived. No tap happens, so it still arrives before any moment.
  let moment: { moment: boolean; gzip: number }[] = [];
  await expect
    .poll(
      async () => {
        moment = (await Promise.all(scripts)).filter((s) => s.moment);
        return moment.length;
      },
      { message: "the moment's chunk was preloaded", timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  test.info().annotations.push({
    type: "celebration chunk (gzip bytes)",
    description: moment.map((s) => s.gzip).join(", "),
  });
  for (const s of moment) expect(s.gzip).toBeLessThanOrEqual(35 * 1024);
});

/**
 * The celebration (points credited → reward unlocked) under the calibrated 4× CPU throttle, from the tap on the
 * /dev/motion demo until every animation in the moment has finished.
 */
async function celebrationRun(page: Page, info: TestInfo) {
  await page.addInitScript(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__long.push(e.duration);
    }).observe({ type: "longtask", buffered: false });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const { cdp } = await throttleCpu(page, info);
  await page.goto("/dev/motion");
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await page.waitForLoadState("networkidle");
  // Measured from just before a real (trusted) tap, until the moment's animations and its particles have all
  // finished: the tap is the page's first gesture, so the sound's first AudioContext is part of what is measured.
  const measuring = page.evaluate(async () => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    const times: number[] = [];
    const start = performance.now();
    let card: Element | null = null;
    while (times.length < 700 && performance.now() - start < 12_000) {
      times.push(await new Promise<number>(requestAnimationFrame));
      card ??= document.querySelector('[data-testid="celebration"] [data-testid="reward-card"]');
      if (
        card &&
        times.length > 10 &&
        !document.documentElement.hasAttribute("data-fx-live") &&
        card.getAnimations({ subtree: true }).every((a) => a.playState !== "running")
      )
        break;
    }
    return { times, rewarded: card !== null, long: [...w.__long] };
  });
  await page.getByTestId("demo-celebrate-reward").click();
  const run = await measuring;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const frames = run.times;
  // From the first frame after the chunk arrived (the dialog's first paint), the moment itself.
  const gaps = frames.slice(1).map((t, i) => t - (frames[i] ?? t));
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const fps = (1000 * gaps.length) / gaps.reduce((sum, g) => sum + g, 0);
  const longest = Math.max(0, ...run.long);
  info.annotations.push({
    type: "celebration frames",
    description: `${String(frames.length)} frames, ${fps.toFixed(1)} fps, p95 ${p95.toFixed(1)} ms, long tasks ${String(run.long.length)} (max ${longest.toFixed(0)} ms)`,
  });
  return { frames, rewarded: run.rewarded, fps, p95, longest };
}

test("[P1-15] the celebration plays under 4× CPU throttling with no long task over 65 ms @perf", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  const run = await celebrationRun(page, test.info());
  expect(run.rewarded, "the reward moment started").toBe(true);
  expect(run.frames.length).toBeGreaterThan(30);
  expect(run.longest).toBeLessThanOrEqual(LONG_TASK_MS);
});

test("[P1-15] the celebration holds 60 fps under 4× CPU throttling @fps", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
  const m = await medianFrameRate(test.info(), () => celebrationRun(page, test.info()));
  expect(m.fps).toBeGreaterThanOrEqual(55);
  expect(m.p95).toBeLessThanOrEqual(20);
});
