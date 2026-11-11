import AxeBuilder from "@axe-core/playwright";
import { AXE_TAGS, expect, test } from "./support/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Overlays on /dev/ui (P0-09 step C: AC 2, 3, 11). Mouse drags run in every project (touch projects too:
 * the grip takes any pointer type); the touch-only "pull the content down" path is covered in step D.
 */
const trigger = (page: Page, demo: string): Locator =>
  page.locator(`[data-overlay-trigger="${demo}"]`);
const topDialog = (page: Page): Locator => page.locator("dialog[open]").last();
const panelOf = (page: Page): Locator => topDialog(page).locator('[data-part="panel"]');

async function open(page: Page, demo: string): Promise<void> {
  await trigger(page, demo).click();
  await expect(topDialog(page)).toHaveAttribute("data-state", "open");
  // Let the enter transition finish before measuring.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("dialog[open] *")].every((el) =>
      el.getAnimations().every((a) => a.playState !== "running"),
    ),
  );
}

const activeInsideTopDialog = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const dialogs = document.querySelectorAll("dialog[open]");
    const top = dialogs[dialogs.length - 1];
    return !!top && top.contains(document.activeElement);
  });

async function serious(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test.describe("[P0-09] overlays", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(trigger(page, "modal")).toBeEnabled();
  });

  for (const demo of ["modal", "panel", "sheet"] as const) {
    test(`[P0-09] ${demo}: focus moves in, Tab cycles inside, Esc closes, focus returns`, async ({
      page,
      browserName,
      isMobile,
    }) => {
      test.skip(isMobile, "keyboard: desktop projects");
      await trigger(page, demo).focus();
      await page.keyboard.press("Enter");
      await expect(topDialog(page)).toHaveAttribute("data-state", "open");
      await expect(panelOf(page)).toBeFocused();
      // More Tabs than there are controls: focus never leaves the dialog, either direction.
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Tab");
        expect(await activeInsideTopDialog(page), `Tab ${String(i + 1)} (${browserName})`).toBe(
          true,
        );
      }
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("Shift+Tab");
        expect(await activeInsideTopDialog(page), `Shift+Tab ${String(i + 1)}`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(trigger(page, demo)).toBeFocused();
    });

    test(`[P0-09] ${demo}: page behind is inert and locked; axe clean while open`, async ({
      page,
    }) => {
      const box = await trigger(page, "modal").boundingBox();
      await open(page, demo);
      // A point over the page's own trigger hits the overlay (backdrop or panel), not the page.
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest("dialog") !== null,
        { x: (box?.x ?? 0) + 4, y: (box?.y ?? 0) + 4 },
      );
      expect(hit).toBe(true);
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
      expect(await serious(page)).toEqual([]);
      // Backdrop tap closes (top-left corner is backdrop for every kind at every width).
      await page.mouse.click(2, 2);
      await expect(page.locator("dialog")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    });
  }

  test("[P0-09] stacked: Esc closes the top one only, then the first", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "keyboard: desktop projects");
    await open(page, "stacked");
    await page.getByRole("button", { name: "Open another on top" }).click();
    await expect(page.locator("dialog[open]")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Open another on top" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("[P0-09] text-only and tall modals: dialog takes focus; tall content scrolls inside, close stays reachable", async ({
    page,
  }) => {
    await open(page, "text");
    await expect(panelOf(page)).toBeFocused();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("dialog")).toHaveCount(0);

    await open(page, "tall");
    const body = topDialog(page).locator('[data-part="body"]');
    const sizes = await body.evaluate((el) => ({
      scroll: el.scrollHeight,
      client: el.clientHeight,
    }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    const panel = await panelOf(page).boundingBox();
    const viewport = page.viewportSize();
    expect(
      (panel?.y ?? -1) >= 0 && (panel?.y ?? 0) + (panel?.height ?? 0) <= (viewport?.height ?? 0),
    ).toBe(true);
    await expect(page.getByRole("button", { name: "Close" })).toBeInViewport();
  });

  test("[P0-09] toast open: axe clean", async ({ page }) => {
    await page.getByRole("button", { name: "Error toast" }).click();
    await expect(
      page.getByRole("region", { name: "Notifications" }).getByRole("listitem"),
    ).toHaveCount(1);
    expect(await serious(page)).toEqual([]);
  });

  test("[P0-09] motion: transform + opacity only, ≤ 300ms; reduced motion only fades", async ({
    page,
  }) => {
    for (const demo of ["modal", "panel", "sheet"] as const) {
      await open(page, demo);
      const t = await panelOf(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { props: cs.transitionProperty, durations: cs.transitionDuration };
      });
      expect(t.props).toBe("transform, opacity");
      for (const d of t.durations.split(","))
        expect(Number.parseFloat(d) * 1000).toBeLessThanOrEqual(300);
      await page.keyboard.press("Escape").catch(() => undefined);
      await page
        .getByRole("button", { name: "Close" })
        .click({ timeout: 1000 })
        .catch(() => undefined);
      await expect(page.locator("dialog")).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const demo of ["modal", "panel", "sheet"] as const) {
      await trigger(page, demo).click();
      // While entering: no transform anywhere on the panel, only an opacity fade.
      const enter = await panelOf(page).evaluate((el) => ({
        transform: getComputedStyle(el).transform,
        animated: el.getAnimations().map((a) => (a as CSSTransition).transitionProperty),
      }));
      expect(enter.transform === "none" || enter.transform === "matrix(1, 0, 0, 1, 0, 0)").toBe(
        true,
      );
      expect(enter.animated.filter((p) => p !== "opacity")).toEqual([]);
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);
    }
  });
});

test.describe("[P0-09] bottom sheet drag", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(trigger(page, "sheet")).toBeEnabled();
  });

  /** Drags the grip from its handle by `dy` px over `steps` moves spaced `stepMs` apart. */
  async function drag(page: Page, dy: number, steps: number, stepMs: number): Promise<void> {
    const grip = await topDialog(page).locator('[data-part="grip"]').boundingBox();
    if (!grip) throw new Error("no grip");
    const x = grip.x + grip.width / 2;
    const y = grip.y + 8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, y + (dy * i) / steps);
      if (stepMs > 0) await page.waitForTimeout(stepMs);
    }
    await page.mouse.up();
  }
  const sheetHeight = async (page: Page): Promise<number> =>
    (await panelOf(page).boundingBox())?.height ?? 0;

  test("[P0-09] a short slow drag springs back; past 25% closes", async ({ page }) => {
    await open(page, "sheet");
    const h = await sheetHeight(page);
    await drag(page, h * 0.12, 6, 60);
    await expect(topDialog(page)).toHaveAttribute("data-state", "open");
    await expect
      .poll(() => panelOf(page).evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await drag(page, h * 0.4, 8, 60);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(trigger(page, "sheet")).toBeFocused();
  });

  test("[P0-09] a fast short flick closes", async ({ page }) => {
    await open(page, "sheet");
    const h = await sheetHeight(page);
    await drag(page, Math.min(60, h * 0.2), 3, 0);
    await expect(page.locator("dialog")).toHaveCount(0);
  });

  test("[P0-09] wheel at the sheet's scroll end leaves the page where it was", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "wheel: desktop projects (touch scroll in step D)");
    // Opening scrolls the trigger into view first; measure once the sheet is open.
    await open(page, "sheet-long");
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    const list = topDialog(page).locator('[data-part="body"]');
    await list.hover();
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 800);
    await expect.poll(() => list.evaluate((el) => el.scrollTop > 0)).toBe(true);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.locator("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

test.describe("[P0-09] overlay screenshots", () => {
  test("[P0-09] each overlay open at 320, 390 and 1440 (touch projects at their own size)", async ({
    page,
    shoot,
    isMobile,
  }, testInfo) => {
    // chromium + webkit cover the three widths; the touch projects and desktop1440 shoot at their own size.
    const own = isMobile || testInfo.project.name === "desktop1440";
    const widths = own ? [0] : [320, 390, 1440];
    for (const width of widths) {
      if (width > 0) await page.setViewportSize({ width, height: 800 });
      await page.goto("/dev/ui");
      await expect(trigger(page, "modal")).toBeEnabled();
      for (const demo of ["modal", "tall", "panel", "sheet", "sheet-long"] as const) {
        await open(page, demo);
        await shoot(`overlay-${demo}-${width > 0 ? String(width) : "native"}`, { fullPage: false });
        await topDialog(page).getByRole("button", { name: "Close" }).click();
        await expect(page.locator("dialog")).toHaveCount(0);
      }
    }
  });
});
