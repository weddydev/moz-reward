import { type Page } from "@playwright/test";
import {
  clearAnimations,
  describeAnimations,
  fromValue,
  heldCount,
  holdAnimations,
  recordAnimations,
  releaseHeld,
  scaleOf,
  started,
  toValue,
  type StartedAnimation,
} from "./support/animations";
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

/**
 * Counts, frame by frame for 8 s, what the wipe showed: the stage, a circle clip on the content, the copy, a sunk
 * Wallet (its content box, or its copy on the stage once the shop committed), and `gone`: frames in the metal's
 * first 600 ms after the tap that showed neither the Wallet nor its copy (the Wallet vanishing at once).
 */
/**
 * Frames drawn during the wipe (Chromium-only evidence, TESTING §7), and `gone`: frames with the Wallet gone
 * before the metal covered it, an upper bound (0) that holds on every engine, since fewer frames never break it.
 * What was started is read from the shared recorder (`wipeParts`).
 */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wipe: Record<string, number> };
    w.__wipe = { stage: 0, clip: 0, clone: 0, sunk: 0, gone: 0 };
    let tap = 0;
    document.addEventListener(
      "click",
      () => {
        tap = performance.now();
      },
      { capture: true, once: true },
    );
    const until = performance.now() + 8000;
    const tick = (): void => {
      const stage = document.querySelector<HTMLElement>(".m-wipe-stage");
      if (stage && !stage.hidden) w.__wipe.stage = (w.__wipe.stage ?? 0) + 1;
      const clones = [...document.querySelectorAll<HTMLElement>("[data-wipe-clone]")];
      if (clones.length > 0) w.__wipe.clone = (w.__wipe.clone ?? 0) + 1;
      const content = [...document.querySelectorAll<HTMLElement>("[data-route-content]")].pop();
      const wallet = content?.querySelector('[data-testid="wallet-card"]') ? content : null;
      if (content) {
        const cs = getComputedStyle(content);
        if (cs.clipPath.startsWith("circle")) w.__wipe.clip = (w.__wipe.clip ?? 0) + 1;
      }
      // The content box (the Wallet sinking, or rising again on the way back while its loading cover shows) or a
      // stage copy of the Wallet sinking on.
      // Every route content, not only the last: during the swap the old page and the new one can both be in.
      const contents = [...document.querySelectorAll<HTMLElement>("[data-route-content]")];
      const sunk = [...contents, ...clones].some((el) => getComputedStyle(el).transform !== "none");
      if (sunk) w.__wipe.sunk = (w.__wipe.sunk ?? 0) + 1;
      if (tap && performance.now() - tap < 600 && !wallet && clones.length === 0) {
        w.__wipe.gone = (w.__wipe.gone ?? 0) + 1;
      }
      if (performance.now() < until) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const seen = (page: Page): Promise<Record<string, number>> =>
  page.evaluate(() => (window as unknown as { __wipe: Record<string, number> }).__wipe);

const kf = (a: StartedAnimation, prop: string, end: "from" | "to"): string =>
  String((end === "from" ? fromValue(a, prop) : toValue(a, prop)) ?? "");
/** A circle clip that opens from nothing (`circle(0px at …)` → a full circle), or closes to nothing. */
const opensCircle = (a: StartedAnimation): boolean =>
  /^circle\(0(px)?\s/.test(kf(a, "clipPath", "from")) &&
  !/^circle\(0(px)?\s/.test(kf(a, "clipPath", "to"));
const closesCircle = (a: StartedAnimation): boolean =>
  /^circle\(0(px)?\s/.test(kf(a, "clipPath", "to")) &&
  !/^circle\(0(px)?\s/.test(kf(a, "clipPath", "from"));
const near = (v: number, target: number): boolean => Math.abs(v - target) < 0.001;
/** Scale 1 → .92 (the Wallet sinking, WIPE.walletScale) or .92 → 1 (rising back). */
const sinks = (a: StartedAnimation): boolean =>
  near(scaleOf(kf(a, "transform", "from")), 1) && near(scaleOf(kf(a, "transform", "to")), 0.92);
const rises = (a: StartedAnimation): boolean =>
  near(scaleOf(kf(a, "transform", "from")), 0.92) && near(scaleOf(kf(a, "transform", "to")), 1);

/**
 * The wipe's parts started since the last `clearAnimations` (DESIGN §7.3, `WIPE` in src/lib/motion/wipe.ts): the
 * metal circle on the stage, the shop opening in its circle, the Wallet (or its stage copy) sinking, the shop's
 * copy closing on the way back and the Wallet rising back. Read from the `animate()` calls, so a Linux WebKit
 * that draws no frame of them still proves they were started (KI-59).
 */
async function wipeParts(page: Page): Promise<{
  metal: StartedAnimation[];
  open: StartedAnimation[];
  sink: StartedAnimation[];
  close: StartedAnimation[];
  rise: StartedAnimation[];
  log: string;
}> {
  const metal = await started(page, ".m-wipe-stage > .m-wipe");
  const content = await started(page, "[data-route-content]");
  const copies = await started(page, "[data-wipe-clone]");
  return {
    metal: metal.filter(opensCircle),
    open: content.filter(opensCircle),
    sink: [...content, ...copies].filter(sinks),
    close: copies.filter(closesCircle),
    rise: content.filter(rises),
    log: describeAnimations([...metal, ...content, ...copies]),
  };
}

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
    browserName,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await recordAnimations(page);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await record(page);
    await clearAnimations(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    await settled(page);
    // Started (every engine), with the reference's timing (WIPE): the metal circle from the tap (620 ms), the shop
    // opening in its circle (620 ms, after the 110 ms shop delay at most, held closed before it starts) and the
    // Wallet sinking to .92 (600 ms) or its stage copy sinking on.
    const into = await wipeParts(page);
    expect(into.metal.length, `the metal circle poured:\n${into.log}`).toBe(1);
    expect(into.metal[0]?.timing.duration, into.log).toBe(620);
    expect(into.metal[0]?.timing.easing.replace(/\s/g, ""), into.log).toBe(
      "cubic-bezier(0.65,0,0.35,1)",
    );
    expect(into.open.length, `the shop opened in a circle:\n${into.log}`).toBe(1);
    expect(into.open[0]?.timing, into.log).toMatchObject({ duration: 620, fill: "backwards" });
    expect(into.open[0]?.timing.delay ?? -1, into.log).toBeLessThanOrEqual(110);
    expect(into.sink.length, `the wallet sank:\n${into.log}`).toBeGreaterThan(0);
    for (const a of into.sink) expect(a.timing.duration, into.log).toBe(600);
    // Drawn (Chromium only): frames showed the stage, the circle and the sinking.
    const frames = await seen(page);
    if (browserName === "chromium") {
      expect(frames.stage, "frames drawn with the metal stage").toBeGreaterThan(0);
      expect(frames.clip, "frames drawn with the shop in a circle").toBeGreaterThan(0);
      expect(frames.sunk, "frames drawn with the wallet sunk").toBeGreaterThan(0);
    }
    // However fast the shop commits (a frame or two on a fast phone), the Wallet never just vanishes under the
    // opening metal: its copy sinks on on the stage (PD-11). An upper bound: every engine.
    expect(frames.gone, "frames with the Wallet gone before the metal covered it").toBe(0);
    // The area line rises with the content; the page's own parts are marked for it.
    await expect(page.locator("[data-rise]").first()).toBeAttached();

    await record(page);
    await clearAnimations(page);
    await page.getByTestId("shop-back").click();
    await expect(page).toHaveURL("/wallet");
    await expect(card(page)).toBeVisible();
    await settled(page);
    // Started: a copy of the shop closing its circle over the Wallet (520 ms), the Wallet rising from .92.
    const back = await wipeParts(page);
    expect(back.close.length, `a copy of the shop closed over the wallet:\n${back.log}`).toBe(1);
    expect(back.close[0]?.timing.duration, back.log).toBe(520);
    expect(back.rise.length, `the wallet came back from the sunk state:\n${back.log}`).toBe(1);
    expect(back.rise[0]?.timing, back.log).toMatchObject({ duration: 520, fill: "backwards" });
    if (browserName === "chromium") {
      const drawn = await seen(page);
      expect(drawn.clone, "frames drawn with the closing copy").toBeGreaterThan(0);
      expect(drawn.sunk, "frames drawn with the wallet rising").toBeGreaterThan(0);
    }
  });

  test("[PD-11] the shop's mini vault bar fills from empty in the wipe (420 ms in, 900 ms) and rests at the member's gold (C-80)", async ({
    page,
    signInAs,
    browserName,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await recordAnimations(page);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    // Drawn, frame by frame (Chromium-only evidence): the bar's scaleX.
    await page.evaluate(() => {
      const w = window as unknown as { __barScales: number[] };
      w.__barScales = [];
      const until = performance.now() + 6000;
      const tick = (): void => {
        const bar = document.querySelector<HTMLElement>(
          '[data-testid="mini-vault"] [data-wipe-bar]',
        );
        if (bar) w.__barScales.push(new DOMMatrix(getComputedStyle(bar).transform).a);
        if (performance.now() < until) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await clearAnimations(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("mini-vault")).toContainText("720 / 1,000");
    await settled(page);
    // Started (every engine; read from the `animate()` call, not from frames: Linux WebKit can draw none for the
    // whole fill, KI-10, CI 45588327123).
    const fills = await started(page, '[data-testid="mini-vault"] [data-wipe-bar]');
    const log = describeAnimations(fills);
    expect(fills.length, `the wipe filled the bar:\n${log}`).toBe(1);
    const fill = fills[0];
    // The delay counts from the tap, so what is left of the 420 ms when the shop commits; the length is 900.
    expect(fill?.timing.duration, log).toBe(900);
    expect(fill?.timing.delay ?? -1, log).toBeLessThanOrEqual(420);
    // It starts empty and is held empty until its delay ends (the fill `backwards`), whatever frames get drawn.
    expect(fill ? fromValue(fill, "transform") : null, `the fill starts empty:\n${log}`).toBe(
      "scaleX(0)",
    );
    expect(["backwards", "both"], `held empty before it starts:\n${log}`).toContain(
      fill?.timing.fill,
    );
    // Drawn (Chromium only): Linux WebKit's first drawn frame may already be mid-fill (KI-10).
    if (browserName === "chromium") {
      const scales = await page.evaluate(
        () => (window as unknown as { __barScales: number[] }).__barScales,
      );
      expect(Math.min(...scales), "the bar was drawn empty first").toBeLessThan(0.05);
    }
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
    await recordAnimations(page);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    // Hold the arriving shop's opening at its first frame, whatever the machine's speed: each animation started
    // on its content is paused at the `animate()` call, so the switch lands mid-wipe for sure, and only the
    // switch can end it (a frame-driven scan could miss the whole opening on a starved Linux WebKit, KI-10).
    await holdAnimations(page, "[data-route-content]", `/shops/${shopId}`);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect
      .poll(() => heldCount(page), { message: "the shop's opening is held" })
      .toBeGreaterThan(0);
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-reduce-motion", "true");
    });
    await expect(page.getByTestId("wipe-stage")).toBeHidden({ timeout: 1_000 });
    // Let go of what this test froze: an animation paused at 0 ms (a content rise caught before its first tick)
    // keeps its "from" frame even at reduced motion's 0.001 ms, which no real page can reach, and the guard's
    // axe scan read the half-shown page as low contrast (CI 45576974690, iphone14; KI-58).
    await releaseHeld(page);
    await settled(page);
    // The page has fully arrived: its streamed status row is in and shown (a part that streams in under reduced
    // motion still takes its ≤ 150 ms fade, and one landing after the test ended faded under the axe scan).
    await expect(page.getByTestId("shop-status")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          // The badge and every box above it fully shown (no fade left on the way up).
          for (
            let el = document.querySelector("[data-testid=shop-status]");
            el;
            el = el.parentElement
          )
            if (getComputedStyle(el).opacity !== "1") return false;
          return true;
        }),
      )
      .toBe(true);
  });

  test("[PD-08] slow network: the metal holds over the Wallet until the shop commits, then opens", async ({
    page,
    signInAs,
    browserName,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    // Everything for the shop page is slow, the prefetch too, so nothing can commit early (1.8 s: past the
    // circle's 620 ms, well inside the 5 s after which an untaken wipe is abandoned).
    await page.route(`**/shops/${shopId}*`, async (route) => {
      await new Promise((r) => setTimeout(r, 1800));
      await route.continue();
    });
    await recordAnimations(page);
    await page.goto("/wallet");
    await expect(card(page)).toBeVisible();
    await record(page);
    // Every engine: the stage is never hidden while the Wallet is still the page (it holds until the shop
    // commits), watched on the stage's `hidden` attribute, not on frames.
    await page.getByTestId("wipe-stage").evaluate((stage) => {
      const w = window as unknown as { __hiddenOn: string[] };
      w.__hiddenOn = [];
      new MutationObserver((records) => {
        for (const r of records)
          if (r.oldValue === null && (stage as HTMLElement).hidden)
            w.__hiddenOn.push(location.pathname);
      }).observe(stage, { attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    });
    await clearAnimations(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    // Started at once: the metal circle (620 ms), while the Wallet is still the page.
    await expect
      .poll(async () => (await wipeParts(page)).metal.length, {
        message: "the metal circle poured",
      })
      .toBe(1);
    expect(new URL(page.url()).pathname).toBe("/wallet");
    await expect(page.getByTestId("wipe-stage")).toBeVisible();
    // Drawn (Chromium only): the circle has run its 620 ms and the stage still shows over the Wallet.
    if (browserName === "chromium")
      await expect
        .poll(() =>
          page.evaluate(() => {
            const metal = document.querySelector(".m-wipe-stage > .m-wipe")?.getAnimations()[0];
            return metal?.playState === "finished" && location.pathname === "/wallet";
          }),
        )
        .toBe(true);
    await expect(page).toHaveURL(`/shops/${shopId}`, { timeout: 15_000 });
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café", {
      timeout: 15_000,
    });
    await settled(page);
    expect(
      await page.evaluate(() => (window as unknown as { __hiddenOn: string[] }).__hiddenOn),
      "where the stage was hidden: never on the Wallet",
    ).not.toContain("/wallet");
    const parts = await wipeParts(page);
    expect(
      parts.open.length,
      `the shop opened in the circle once it committed:\n${parts.log}`,
    ).toBe(1);
    if (browserName === "chromium")
      expect((await seen(page)).clip, "frames drawn with the shop in a circle").toBeGreaterThan(0);
  });

  test("[PD-08] slow way back: the hidden shop can't be tapped while the Wallet is on its way", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    // The Wallet is slow, its prefetch from the shop page too, so nothing commits early: every Wallet request
    // waits until 3 s after the tap (past the closing copy's 520 ms, inside the 5 s abandon window). Timed from
    // the tap, not from the request: a prefetch at the shop's load under a busy parallel run used to come back
    // before the check (KI-56).
    let tap = (): void => {};
    const tapped = new Promise<void>((r) => {
      tap = r;
    });
    await page.route("**/wallet*", async (route) => {
      await tapped;
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue().catch(() => undefined);
    });
    await page.goto(`/shops/${shopId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    tap();
    await page.getByTestId("shop-back").click();
    // The copy has closed and the stage is gone; the shop is still the page, invisible (code review MED-1).
    await expect(page.getByTestId("wipe-stage")).toBeHidden({ timeout: 2_000 });
    expect(new URL(page.url()).pathname).toBe(`/shops/${shopId}`);
    const shop = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-route-content]");
      return { opacity: el?.style.opacity, inert: el?.inert };
    });
    expect(shop).toEqual({ opacity: "0", inert: true });
    await expect(page).toHaveURL("/wallet", { timeout: 15_000 });
    await settled(page);
    expect(
      await page.evaluate(() => document.querySelector<HTMLElement>("[data-route-content]")?.inert),
      "the Wallet is live again",
    ).toBe(false);
  });

  test("[PD-08] (P1-C close) way back on a frozen timeline: the closing copy still leaves the stage on time", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    // As above: the Wallet can't commit for 3 s after the tap.
    let tap = (): void => {};
    const tapped = new Promise<void>((r) => {
      tap = r;
    });
    await page.route("**/wallet*", async (route) => {
      await tapped;
      await new Promise((r) => setTimeout(r, 3000));
      await route.continue().catch(() => undefined);
    });
    await page.goto(`/shops/${shopId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    tap();
    await page.getByTestId("shop-back").click();
    // A page that draws no frames (Linux WebKit after a load, KI-10; a throttled phone) never finishes the close:
    // pausing it stands in for that. A timer still takes the stage down, so nothing waits on frames.
    const paused = await page.evaluate(() => {
      const anims =
        document.querySelector("[data-testid='wipe-stage']")?.getAnimations({ subtree: true }) ??
        [];
      for (const a of anims) a.pause();
      return anims.length;
    });
    expect(paused, "the closing copy was animating").toBeGreaterThan(0);
    await expect(page.getByTestId("wipe-stage")).toBeHidden({ timeout: 2_000 });
    expect(new URL(page.url()).pathname, "before the Wallet commits").toBe(`/shops/${shopId}`);
    await expect(page).toHaveURL("/wallet", { timeout: 15_000 });
    await settled(page);
    expect(
      await page.evaluate(() => document.querySelector<HTMLElement>("[data-route-content]")?.inert),
      "the Wallet is live again",
    ).toBe(false);
  });

  test("[PD-08] reduced motion: no metal, no circle, no sinking; the page simply arrives", async ({
    page,
    signInAs,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const me = await signInAs("customer");
    const shopId = await seedShop(page, me.userId);
    await recordAnimations(page);
    await page.goto("/wallet");
    await record(page);
    await clearAnimations(page);
    await card(page).click({ position: { x: 60, y: 24 } });
    await expect(page).toHaveURL(`/shops/${shopId}`);
    await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
    await settled(page);
    // None of the wipe's parts was started, not even for 0 ms (the recorder sees every `animate()` call); no frame
    // showed them either (an upper bound, every engine).
    const into = await wipeParts(page);
    expect(
      [into.metal, into.open, into.sink].flat().length,
      `wipe parts started:\n${into.log}`,
    ).toBe(0);
    const s = await seen(page);
    expect(s.stage).toBe(0);
    expect(s.clip).toBe(0);
    expect(s.sunk).toBe(0);
    await clearAnimations(page);
    await page.getByTestId("shop-back").click();
    await expect(page).toHaveURL("/wallet");
    await settled(page);
    const back = await wipeParts(page);
    expect(
      [back.close, back.rise].flat().length,
      `wipe parts started on the way back:\n${back.log}`,
    ).toBe(0);
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
