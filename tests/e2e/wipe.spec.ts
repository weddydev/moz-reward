import { type Page } from "@playwright/test";
import { LONG_TASK_MS, throttleCpu } from "./support/cpu-throttle";
import { expect, test, testApiHeaders } from "./support/test";

/**
 * PD-08 card → shop gold wipe in the app (DESIGN §7.3; `src/lib/motion/wipe-stage.ts`): the metal circle from
 * the tap on the fixed stage, the shop content opening in the same circle (instead of the slide), the way back,
 * a back tap or browser back during the wipe, a slow network and reduced motion. Each run ends with nothing
 * left behind: no stage, no copy, no clip, scale, opacity or z-index on the page content. The frame-exact look
 * is the parity harness's (`/dev/molten` phone, tests/parity).
 */

async function seedShop(page: Page, userId: string): Promise<string> {
  const res = await page.request.post("/api/test/shop", {
    data: {
      status: "active",
      name: "Brew & Bloom Café",
      programme: true,
      details: true,
      memberUserId: userId,
      member: { purchaseCount: 12, progressGold: 720, ingotsCompleted: 1, lastVisitDaysAgo: 2 },
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { shopId: string }).shopId;
}

/** Counts, frame by frame for 8 s, what the wipe showed: the stage, a circle clip on the content, the copy, a sunk content box. */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wipe: Record<string, number> };
    w.__wipe = { stage: 0, clip: 0, clone: 0, sunk: 0 };
    const until = performance.now() + 8000;
    const tick = (): void => {
      const stage = document.querySelector<HTMLElement>(".m-wipe-stage");
      if (stage && !stage.hidden) w.__wipe.stage = (w.__wipe.stage ?? 0) + 1;
      if (document.querySelector("[data-wipe-clone]")) w.__wipe.clone = (w.__wipe.clone ?? 0) + 1;
      const content = [...document.querySelectorAll<HTMLElement>("[data-route-content]")].pop();
      if (content) {
        const cs = getComputedStyle(content);
        if (cs.clipPath.startsWith("circle")) w.__wipe.clip = (w.__wipe.clip ?? 0) + 1;
        if (cs.transform !== "none") w.__wipe.sunk = (w.__wipe.sunk ?? 0) + 1;
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const seen = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => (window as unknown as { __wipe: Record<string, number> }).__wipe);

/** Nothing of the wipe is left: the stage hidden and empty, the content box plain. */
async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId("wipe-stage")).toBeHidden();
  await expect(page.locator("[data-wipe-clone]")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = [...document.querySelectorAll<HTMLElement>("[data-route-content]")].pop();
        if (!c) return "no content";
        const cs = getComputedStyle(c);
        return [
          cs.clipPath,
          cs.transform,
          cs.opacity,
          c.style.zIndex,
          c.style.background,
          c.style.opacity,
          c.style.minHeight,
          c.inert,
          c.getAnimations().length,
        ].join("|");
      }),
    )
    .toBe("none|none|1|||||false|0");
}

const card = (page: Page) => page.getByTestId("wallet-card").first();

test.describe("[PD-08] gold wipe: Wallet card → shop and back", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("[PD-08] a card tap pours the metal from the tap, the shop opens in the circle, back closes it onto the button", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await record(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    await settled(page);
    const into = await seen(page);
    expect(into.stage, "the metal stage showed").toBeGreaterThan(0);
    expect(into.clip, "the shop opened in a circle").toBeGreaterThan(0);
    expect(into.sunk, "the wallet sank").toBeGreaterThan(0);
    // The area line rises with the content; the page's own parts are marked for it.
    await expect(page.locator("[data-rise]").first()).toBeAttached();

    await record(page);
    await page.getByTestId("shop-back").click();
    await expect(page).toHaveURL("/wallet");
    await expect(card(page)).toBeVisible();
    await settled(page);
    const back = await seen(page);
    expect(back.clone, "a copy of the shop closed over the wallet").toBeGreaterThan(0);
    expect(back.sunk, "the wallet came back from the sunk state").toBeGreaterThan(0);
  });

  test("[PD-11] the shop's mini vault bar fills from empty in the wipe (420 ms in, 900 ms) and rests at the member's gold (C-80)", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    // Frame by frame: the bar's drawn scaleX, and the timing of the animation that fills it.
    await page.evaluate(() => {
      const w = window as unknown as { __bar: { scales: number[]; timing: string | null } };
      w.__bar = { scales: [], timing: null };
      const until = performance.now() + 6000;
      const tick = (): void => {
        const bar = document.querySelector<HTMLElement>(
          '[data-testid="mini-vault"] [data-wipe-bar]',
        );
        if (bar) {
          w.__bar.scales.push(new DOMMatrix(getComputedStyle(bar).transform).a);
          const t = bar.getAnimations()[0]?.effect?.getTiming();
          if (t && !w.__bar.timing) w.__bar.timing = `${String(t.delay)}|${String(t.duration)}`;
        }
        if (performance.now() < until) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("mini-vault")).toContainText("720 / 1,000");
    await settled(page);
    const bar = await page.evaluate(
      () => (window as unknown as { __bar: { scales: number[]; timing: string | null } }).__bar,
    );
    expect(bar.timing, "the wipe filled the bar").not.toBeNull();
    // The delay counts from the tap, so what is left of the 420 ms when the shop commits; the length is 900.
    expect(Number(bar.timing?.split("|")[1])).toBe(900);
    expect(Math.min(...bar.scales), "the bar started empty").toBeLessThan(0.05);
    // It rests at 720 / 1,000 once its fill ends (after the circle's).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(
            '[data-testid="mini-vault"] [data-wipe-bar]',
          );
          return el && el.getAnimations().length === 0
            ? new DOMMatrix(getComputedStyle(el).transform).a
            : -1;
        }),
      )
      .toBeCloseTo(0.72, 2);
    await expect(
      page.getByRole("progressbar", { name: /Gold Vault: 720 \/ 1,000/ }),
    ).toHaveAttribute("aria-valuenow", "720");
  });

  test("[PD-08] back during the wipe and browser back during the wipe both land on a clean Wallet", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await card(page).click({ position: { x: 60, y: 24 } });
    // The cover's back button is there as soon as the loading cover commits, while the circle still opens.
    await page.getByTestId("shop-back").click();
    await expect(page).toHaveURL("/wallet");
    await expect(card(page)).toBeVisible();
    await settled(page);

    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await page.goBack();
    await expect(page).toHaveURL("/wallet");
    await expect(card(page)).toBeVisible();
    await settled(page);
  });

  test("[PD-08] leaving for another page mid-wipe (a dock tab while the shop is slow): the metal goes at once, nothing stays sunk", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.route(`**/shops/${shopId}*`, async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue().catch(() => undefined);
    });
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page.getByTestId("wipe-stage")).toBeVisible();
    // Under the metal the Wallet takes no taps; the dock does.
    await expect
      .poll(() =>
        page.evaluate(
          () => [...document.querySelectorAll<HTMLElement>("[data-route-content]")].pop()?.inert,
        ),
      )
      .toBe(true);
    await page.getByRole("link", { name: "Me" }).click();
    await expect(page).toHaveURL("/me");
    // Well inside the 5 s timeout: the page that committed settled it.
    await expect(page.getByTestId("wipe-stage")).toBeHidden({ timeout: 1_000 });
    await settled(page);
  });

  test("[PD-11] reduced motion switched on mid-wipe lands it at once: no metal, no circle left (FOLLOWUPS L8)", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    // Hold the arriving shop's opening at its first frame, whatever the machine's speed: the switch then lands
    // mid-wipe for sure, and only the switch can end it.
    await page.evaluate((path) => {
      const w = window as unknown as { __held: number };
      w.__held = 0;
      const until = performance.now() + 8000;
      const scan = (): void => {
        const c = [...document.querySelectorAll<HTMLElement>("[data-route-content]")].pop();
        const running =
          location.pathname === path
            ? (c?.getAnimations({ subtree: true }) ?? []).filter(
                (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
              )
            : [];
        for (const a of running) a.pause();
        w.__held += running.length;
        if (w.__held === 0 && performance.now() < until) requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    }, `/shops/${shopId}`);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __held: number }).__held))
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-reduce-motion", "true");
    });
    await expect(page.getByTestId("wipe-stage")).toBeHidden({ timeout: 1_000 });
    await settled(page);
  });

  test("[PD-08] slow network: the metal holds over the Wallet until the shop commits, then opens", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    // Everything for the shop page is slow, the prefetch too, so nothing can commit early (1.8 s: past the
    // circle's 620 ms, well inside the 5 s after which an untaken wipe is abandoned).
    await page.route(`**/shops/${shopId}*`, async (route) => {
      await new Promise((r) => setTimeout(r, 1800));
      await route.continue();
    });
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await record(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    // The circle has run its 620 ms and the stage still shows: the metal holds while the Wallet is still the page.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const metal = document.querySelector(".m-wipe-stage > .m-wipe")?.getAnimations()[0];
          return metal?.playState === "finished" && location.pathname === "/wallet";
        }),
      )
      .toBe(true);
    await expect(page.getByTestId("wipe-stage")).toBeVisible();
    await expect(page).toHaveURL(`/shops/${shopId}`, { timeout: 15_000 });
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café", {
      timeout: 15_000,
    });
    await settled(page);
    const s = await seen(page);
    expect(s.clip, "the shop opened in the circle once it committed").toBeGreaterThan(0);
  });

  test("[PD-08] reduced motion: no metal, no circle, no sinking; the page simply arrives", async ({
    page,
    signInAs,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await record(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    await settled(page);
    const s = await seen(page);
    expect(s.stage).toBe(0);
    expect(s.clip).toBe(0);
    expect(s.sunk).toBe(0);
    await page.getByTestId("shop-back").click();
    await expect(page).toHaveURL("/wallet");
    await settled(page);
    expect((await seen(page)).clone).toBe(0);
  });

  test("[PD-08] screens: the wipe frozen at 300, 500 and 800 ms after the tap, at 390 and 1440, for inspection", async ({
    page,
    browserName,
    signInAs,
  }) => {
    test.skip(
      browserName !== "chromium",
      "slows animations through the Chromium DevTools protocol",
    );
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      // Warm the shop route, so it commits right after the tap and the frames show the reference's +110 ms.
      await page.goto(`/shops/${shopId}`);
      await page.goto("/wallet");
      await expect(card(page)).toBeVisible();
      // Every animation at a tenth of its speed, so the page commits while the wipe is still early.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
      await card(page).click({ position: { x: 60, y: 24 } });
      // The shop content's circle exists once the page committed (not the Wallet's sink, which starts at the
      // tap); then every animation is put on the tap's clock (the metal started at the tap) and frozen.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              [...document.querySelectorAll<HTMLElement>("[data-route-content]")]
                .pop()
                ?.getAnimations()
                .some((a) => (a.effect as KeyframeEffect | null)?.getKeyframes()[0]?.clipPath) ??
              false,
          ),
        )
        .toBe(true);
      for (const ms of [300, 500, 800]) {
        await page.evaluate((t) => {
          const metal = document.querySelector(".m-wipe-stage > .m-wipe")?.getAnimations()[0];
          const now = Number(metal?.currentTime ?? t);
          for (const a of document.getAnimations()) {
            // The view transition's own morph runs on: frozen, its DOM update times out (a page error).
            const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
            if (pseudo.startsWith("::view-transition")) continue;
            a.pause();
            a.currentTime = Math.max(0, Number(a.currentTime ?? 0) + (t - now));
          }
        }, ms);
        // Not `shoot`: it disables animations, which finishes them (the wipe would show its end state).
        await page.screenshot({
          path: `.artifacts/screens/PD-08/wipe-${String(width)}-${String(ms)}ms--${test.info().project.name}.png`,
          animations: "allow",
        });
      }
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      // Land them: play() on a paused animation already past its end would restart it.
      await page.evaluate(() => {
        for (const a of document.getAnimations()) {
          // The view transition's morph too: a resize while it runs aborts it (a page error).
          const end = a.effect?.getComputedTiming().endTime;
          if (typeof end === "number" && Number.isFinite(end)) a.finish();
          else a.play();
        }
      });
      await expect(page).toHaveURL(`/shops/${shopId}`);
      await settled(page);
    }
  });

  test("[PD-08] the wipe in and back under 4× CPU throttling: no long task over 65 ms while it plays @perf", async ({
    page,
    signInAs,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CPU throttling is a Chromium DevTools feature");
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    // Warm the shop route first (its code and data), so the trace measures the wipe, not a first compile.
    await page.goto(`/shops/${shopId}`);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await throttleCpu(page, test.info());
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push(e.duration);
      }).observe({ type: "longtask", buffered: false });
    });
    await card(page).click({ position: { x: 60, y: 24 } });
    // The navigation's own commit (React rendering the shop page: 178 ms at 4× without any wipe, 22 Nov
    // baseline; FOLLOWUPS) is one long task the wipe can't avoid; it is recorded, and the trace judges the wipe
    // from the moment the shop content took it until the way back has landed.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            [...document.querySelectorAll<HTMLElement>("[data-route-content]")]
              .pop()
              ?.getAnimations()
              .some((a) => (a.effect as KeyframeEffect | null)?.getKeyframes()[0]?.clipPath) ??
            false,
        ),
      )
      .toBe(true);
    const commit = await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      const before = [...w.__long];
      w.__long = [];
      return before;
    });
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café", {
      timeout: 15_000,
    });
    await settled(page);
    await page.getByTestId("shop-back").click();
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    await settled(page);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    test.info().annotations.push({
      type: "wipe trace",
      description: `navigation commit ${JSON.stringify(commit.map(Math.round))} ms; during the wipe: long tasks ${String(long.length)} (max ${String(Math.round(Math.max(0, ...long)))} ms)`,
    });
    expect(Math.max(0, ...long)).toBeLessThanOrEqual(LONG_TASK_MS);
  });
});
