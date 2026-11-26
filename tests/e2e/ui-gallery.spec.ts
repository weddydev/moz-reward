import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * Three focused tests rather than one: the axe scan, the full-page screenshot and the toast interaction are
 * independent, and together they used most of one test's budget under full parallel load on WebKit (a click
 * then ran out of time waiting for stability). Each now has its own budget and reports its own failure.
 */
test.describe("[P0-09] UI gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
  });

  test("[P0-09] renders every primitive with no page overflow and no serious accessibility violations", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "Collect points" }).first()).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Requests", exact: true })).toBeVisible();
    // Scan the settled page: controls disabled until hydration fade from .55 to full opacity (120ms) once
    // enabled, and axe measures contrast mid-fade if it runs then.
    await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
    await page.waitForFunction(() =>
      document.getAnimations().every(
        (a) =>
          a.timeline !== document.timeline || // scroll-driven (the Tile's rise) never "finishes"
          a.playState !== "running" ||
          a.effect?.getTiming().iterations === Infinity,
      ),
    );

    // No horizontal page overflow (mobile browsers would zoom the whole page out).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  test("[P0-09] screenshots at 320, 390 and 1440 (touch projects at their own size)", async ({
    page,
    shoot,
    isMobile,
  }, testInfo) => {
    test.setTimeout(60_000);
    const own = isMobile || testInfo.project.name === "desktop1440";
    for (const width of own ? [0] : [320, 390, 1440]) {
      if (width > 0) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
      }
      await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
      await shoot(`ui-gallery-${width > 0 ? String(width) : "native"}`);
    }
  });

  test("[P0-09] C-94 (P1-C close): the Molten parts section at 320 and 1440 (screenshots)", async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, "set widths: desktop projects");
    test.setTimeout(60_000);
    const section = page.locator("section", { has: page.locator("h2#s-molten-parts") });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
      await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
      await section.scrollIntoViewIfNeeded();
      await expect(section.locator("[data-primitive]")).toHaveCount(15);
      const box = await section.boundingBox();
      expect(box?.width ?? Infinity).toBeLessThanOrEqual(width);
      // Pours, digit flips and count-ups play on view: shoot once every finite animation has ended (the
      // vault's ray loop and the dock's orbit are infinite and keep running).
      await section.evaluate(async (el) => {
        el.scrollIntoView();
        for (const block of el.querySelectorAll("[data-primitive]")) {
          block.scrollIntoView({ block: "center" });
          await new Promise((r) => setTimeout(r, 50));
        }
        const finite = (): Animation[] =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity);
        const deadline = Date.now() + 8_000;
        while (finite().some((a) => a.playState === "running") && Date.now() < deadline)
          await new Promise((r) => setTimeout(r, 100));
      });
      await section.screenshot({
        path: `.artifacts/screens/P1-C/molten-parts-${String(width)}--${testInfo.project.name}.png`,
      });
    }
  });

  test("[P0-09] a toast appears when triggered", async ({ page }) => {
    await page.getByRole("button", { name: "Success toast" }).click();
    await expect(
      page.getByRole("region", { name: "Notifications" }).getByText("+80 gold added"),
    ).toBeVisible();
    // Announced once through the polite live region, then cleared (not read twice).
    await expect(page.getByRole("status").filter({ hasText: "+80 gold added" })).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "+80 gold added" })).toHaveCount(0);
  });
});

type LoggedBurst = { x: number; y: number; type: string; count: number; added: number };
const burstsOn = (page: Page): Promise<LoggedBurst[]> =>
  page.evaluate(
    () =>
      (
        window as unknown as { __mozFxBursts?: { list: () => LoggedBurst[] } }
      ).__mozFxBursts?.list() ?? [],
  );
const clearBursts = (page: Page): Promise<void> =>
  page.evaluate(() => {
    (window as unknown as { __mozFxBursts?: { clear: () => void } }).__mozFxBursts?.clear();
  });

test.describe("[P0-09] UI gallery: Molten FX (C-92, C-93; P1-C close)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => "__mozFxBursts" in window)).toBe(true);
  });

  test("[P0-09] C-92: the molten collect button throws 28 sparks and 6 coins from the press point, rolls and toasts", async ({
    page,
  }) => {
    const button = page.getByTestId("collect-button");
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    if (!box) throw new Error("no collect button");
    await clearBursts(page);
    await page.mouse.click(box.x + 40, box.y + box.height / 2);
    await expect.poll(async () => (await burstsOn(page)).length).toBe(2);
    const [sparks, coins] = await burstsOn(page);
    expect([sparks?.type, sparks?.count, coins?.type, coins?.count]).toEqual([
      "spark",
      28,
      "coin",
      6,
    ]);
    for (const b of [sparks, coins]) {
      expect(b?.added ?? 0, "particles thrown").toBeGreaterThan(0);
      expect(Math.abs((b?.x ?? 0) - (box.x + 40)), "from the press point (x)").toBeLessThan(1.5);
    }
    await expect(button).toHaveText(/\+80 gold added/);
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText("80 gold added at Brew & Bloom Café"),
    ).toBeVisible();
  });

  test("[P0-09] C-93: every liquid choice and segmented control sparks over the new choice, both directions", async ({
    page,
  }) => {
    const groups = page.locator('.m-liquid[role="radiogroup"]');
    const n = await groups.count();
    expect(n, "liquid choices on /dev/ui").toBeGreaterThanOrEqual(4);
    for (let g = 0; g < n; g++) {
      const group = groups.nth(g);
      const name = (await group.getAttribute("aria-label")) ?? String(g);
      // The motion preference itself: choosing "reduced" turns every spark off, by design (and would carry on
      // to the groups after it). Its sparks on the way to "on" are the same component's.
      if (name === "Animations") continue;
      const radios = group.locator('[role="radio"]:not([disabled])');
      if ((await radios.count()) < 2) continue;
      const checked = await radios.evaluateAll((els) =>
        els.findIndex((e) => e.getAttribute("aria-checked") === "true"),
      );
      const other = checked === 0 ? 1 : 0;
      for (const [k, dir] of [
        [other, "there"],
        [checked < 0 ? 1 - other : checked, "back"],
      ] as const) {
        const radio = radios.nth(k);
        await radio.scrollIntoViewIfNeeded();
        await clearBursts(page);
        await radio.click();
        await expect
          .poll(async () => (await burstsOn(page)).length, { message: `${name} ${dir}` })
          .toBe(1);
        const [b] = await burstsOn(page);
        const r = await radio.boundingBox();
        expect([b?.type, b?.count], `${name} ${dir}`).toEqual(["spark", 10]);
        expect(b?.added ?? 0, `${name} ${dir}: particles`).toBeGreaterThan(0);
        expect(
          Math.abs((b?.x ?? 0) - ((r?.x ?? 0) + (r?.width ?? 0) / 2)),
          `${name} ${dir}: x`,
        ).toBeLessThan(2);
      }
    }
  });
});
