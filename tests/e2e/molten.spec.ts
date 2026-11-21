import { type Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * PD-02 on the production build: the Molten surfaces, gilded edge and living background on /dev/molten (the
 * parity page). Parity with the reference is proven in tests/parity; this covers behaviour and edge cases.
 */
const card = (page: Page) => page.locator('[data-parity="language"] .m-placed').first();
const seam = (page: Page) => card(page).locator("svg.m-seam");

async function openMolten(page: Page): Promise<void> {
  await page.goto("/dev/molten");
  await expect(seam(page).locator("path").first()).toBeAttached();
}

test("[PD-02] no layout shift on /dev/molten (fonts, edges drawn after hydration)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __shifts: string[] };
    w.__cls = 0;
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (e.hadRecentInput) continue;
        type Src = {
          node?: Node | null;
          previousRect: DOMRectReadOnly;
          currentRect: DOMRectReadOnly;
        };
        const sources = (e as unknown as { sources?: Src[] }).sources ?? [];
        w.__cls += e.value;
        const r = (q: DOMRectReadOnly): string =>
          `${String(Math.round(q.x))},${String(Math.round(q.y))} ${String(Math.round(q.width))}×${String(Math.round(q.height))}`;
        w.__shifts.push(
          `${e.value.toFixed(4)} @${String(Math.round(e.startTime))}ms: ${sources
            .map((x) => {
              const n = x.node;
              const what =
                n instanceof Element
                  ? `${n.tagName}.${n.className}`
                  : `text "${(n?.textContent ?? "").slice(0, 30)}" in ${n?.parentElement?.tagName ?? "?"}.${n?.parentElement?.className ?? ""}`;
              return `${what} ${r(x.previousRect)} → ${r(x.currentRect)}`;
            })
            .join(", ")}`,
        );
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await openMolten(page);
  await page.waitForTimeout(1000);
  const { cls, shifts } = await page.evaluate(() => {
    const w = window as unknown as { __cls?: number; __shifts?: string[] };
    const fonts = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((r) => r.name.endsWith(".woff2"))
      .map((r) => `font ${r.name.slice(-28)} ready @${String(Math.round(r.responseEnd))}ms`);
    return { cls: w.__cls ?? 0, shifts: [...(w.__shifts ?? []), ...fonts] };
  });
  expect(cls, shifts.join("\n")).toBe(0);
});

test("[PD-02] the gilded edge follows its card when it resizes (no drift)", async ({ page }) => {
  await openMolten(page);
  const before = await seam(page).getAttribute("viewBox");
  const gemBefore = await seam(page).locator(".sm-gem path").first().getAttribute("d");
  await card(page).evaluate((el) => {
    (el as HTMLElement).style.width = "320px";
  });
  // The edge measures clientWidth (inside the 1 px gold border), like the reference: 320 − 2.
  await expect(seam(page)).toHaveAttribute("viewBox", /^0 0 318 /);
  expect(await seam(page).getAttribute("viewBox")).not.toBe(before);
  // No drift: the gem stays on the corner arc (same corner radius → the very same gem path).
  const gem = await seam(page).locator(".sm-gem path").first().getAttribute("d");
  expect(gem).toBe(gemBefore);
});

test("[PD-02] reduced motion: the gilded edge and the glows hold still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMolten(page);
  const running = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return t instanceof Element && t.closest("svg.m-seam, .m-aurora");
      }).length,
  );
  expect(running).toBe(0);
});

test("[PD-03] reduced motion: every keyframe animation lands at once (the reference's .rm .001ms wins over the 150 ms net)", async ({
  page,
}) => {
  // PD-A design review HIGH: the attribute net in globals.css (specificity 0,2,0) outranked `.rm *` (0,1,0), so
  // loops still played once over 150 ms (the spec page's conic spun 360°) instead of landing on their end state.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMolten(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  const slow = await page.evaluate(() => {
    const out: string[] = [];
    const ms = (d: string): number =>
      Math.max(...d.split(",").map((x) => parseFloat(x) * (x.trim().endsWith("ms") ? 1 : 1000)));
    for (const el of document.querySelectorAll("body *")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        if (cs.animationName === "none") continue;
        if (ms(cs.animationDuration) > 1)
          out.push(
            `${el.tagName.toLowerCase()}.${el.getAttribute("class") ?? ""}${pseudo ?? ""} ${cs.animationName} ${cs.animationDuration}`,
          );
      }
    }
    return out;
  });
  expect(slow).toEqual([]);
});

test("[PD-02] lite tier (≤ 4 cores): no light glide, the gem stays", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 });
  });
  await openMolten(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)lite(\s|$)/);
  await expect(seam(page).locator(".sm-shine").first()).toHaveCSS("display", "none");
  await expect(seam(page).locator(".sm-gem")).toBeVisible();
});

test("[PD-02] loops sleep: a card off screen and the background in a hidden tab pause", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await openMolten(page);
  // The first language card is below the fold at first? Scroll it fully away to be sure.
  await card(page).evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY + 2000);
  });
  await expect(card(page)).toHaveClass(/m-paused/);
  await card(page).scrollIntoViewIfNeeded();
  await expect(card(page)).not.toHaveClass(/m-paused/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("[data-living-background]")).toHaveClass(/m-paused/);
});

test("[PD-02] a fine-pointer hover replays the glint at once", async ({ page, isMobile }) => {
  // Phones have no fine pointer, so there is no hover replay to test (pixel7 failed on CI, 21 Nov).
  test.skip(isMobile, "fine-pointer (desktop) projects only");
  // The replay is a full-tier effect; CI runners have 4 cores, which is the lite tier (DESIGN §7.2).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  });
  await openMolten(page);
  await card(page).scrollIntoViewIfNeeded();
  await card(page).hover();
  // Replayed: the random delay dropped to 0 and the cycle restarted just now (well inside its 8 s).
  const timing = await seam(page)
    .locator(".sm-glint")
    .evaluate((el) => {
      const a = el.getAnimations()[0];
      return a ? { delay: a.effect?.getTiming().delay ?? null, time: Number(a.currentTime) } : null;
    });
  expect(timing).not.toBeNull();
  expect(timing?.delay).toBe(0);
  expect(timing?.time ?? Infinity).toBeLessThan(1500);
});

test("[PD-02] the Fraunces italic is preloaded only where italic shows (no cost elsewhere)", async ({
  request,
}) => {
  // Next sends font preloads in the Link header (and may also write <link> tags): count distinct files in both.
  const preloads = async (path: string): Promise<number> => {
    const res = await request.get(path);
    const inHeader = (res.headers().link ?? "").match(/[\w.-]+\.woff2/g) ?? [];
    const inHtml = ((await res.text()).match(/<link[^>]+as="font"[^>]*>/g) ?? []).flatMap(
      (tag) => tag.match(/[\w.-]+\.woff2/g) ?? [],
    );
    return new Set([...inHeader, ...inHtml]).size;
  };
  expect(await preloads("/dev/molten")).toBe(3); // upright + italic + Manrope (preloaded since 21 Nov)
  expect(await preloads("/sign-in")).toBe(2); // upright + Manrope, no italic
});

test("[PD-02] Language section at 320, 390 and 1440: no horizontal scroll (screens for inspection)", async ({
  page,
  shoot,
  browserName,
  isMobile,
}) => {
  // Three full-page shots of a tall page: alone on Linux, pixel7 (DPR 2.6) took 28 s and iphone14 38 s. And
  // Playwright's WebKit rasterises on the CPU (Linux and Windows): this page runs at 0–11 fps there after a load
  // or resize (21 Nov 2026; Chromium 60). Speed is the @perf specs' job (real Safari: H-13), not this one's.
  test.slow(browserName === "webkit" || isMobile, "full-page phone shots; CPU-rendered WebKit");
  await openMolten(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `at ${String(width)}`).toBeLessThanOrEqual(0);
    // A DOM scroll, not scrollIntoViewIfNeeded: Playwright resolves locators frame by frame, and CPU-rendered
    // WebKit draws this page at 0–6 fps after a load or resize (21 Nov 2026), so the locator never resolved.
    await page.evaluate(() => {
      document.querySelector('[data-parity="language"]')?.scrollIntoView({ block: "start" });
    });
    await shoot(`molten-language-${String(width)}`);
  }
});
