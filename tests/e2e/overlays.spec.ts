import AxeBuilder from "@axe-core/playwright";
import { AXE_TAGS, expect, test } from "./support/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Overlays on /dev/ui (P0-09 step C: AC 2, 3, 11). Mouse drags run in every project (touch projects too:
 * the grip takes any pointer type); the touch-only paths are in "bottom sheet touch paths".
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
    // Triggers are disabled until hydration. Cold WebKit on a Windows laptop, four workers in parallel, took
    // up to 12.6 s to hydrate /dev/ui (measured 12 Nov 2026): this waits for it, it doesn't time it.
    await expect(trigger(page, "modal")).toBeEnabled({ timeout: 20_000 });
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

  for (const demo of ["modal", "panel", "sheet"] as const) {
    test(`[P0-09] ${demo}: a double-click on its trigger opens it once and it stays open`, async ({
      page,
    }) => {
      // The second click of a double-click lands on the backdrop that has just appeared under the pointer.
      await trigger(page, demo).dblclick();
      await expect(topDialog(page)).toHaveAttribute("data-state", "open");
      await page.waitForTimeout(500); // past any close the second click could have started
      await expect(page.locator("dialog")).toHaveCount(1);
      await expect(topDialog(page)).toHaveAttribute("data-state", "open");
      // A deliberate tap on the backdrop afterwards still closes it.
      await page.mouse.click(2, 2);
      await expect(page.locator("dialog")).toHaveCount(0);
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
    // Scan once the toast has finished entering: mid-fade its text is measured at partial opacity.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );
    expect(await serious(page)).toEqual([]);
  });

  test("[P0-09] motion: transform + opacity only, ≤ 300ms; reduced motion only fades", async ({
    page,
  }) => {
    /** Records which properties start a transition on an overlay panel from now on. */
    const record = (): Promise<void> =>
      page.evaluate(() => {
        const w = window as unknown as { __started: string[]; __ended: boolean; __rec?: boolean };
        w.__started = [];
        w.__ended = false;
        if (w.__rec) return;
        w.__rec = true;
        const onPanel = (e: Event): boolean =>
          (e.target as Element).classList.contains("overlay-panel");
        document.addEventListener(
          "transitionstart",
          (e) => {
            if (onPanel(e)) w.__started.push(e.propertyName);
          },
          true,
        );
        for (const type of ["transitionend", "transitioncancel"])
          document.addEventListener(
            type,
            (e) => {
              if (onPanel(e)) w.__ended = true;
            },
            true,
          );
      });
    const started = (): Promise<string[]> =>
      page.evaluate(() => (window as unknown as { __started: string[] }).__started);
    // Wait for the panel's transition to end, not for a fixed time: Linux WebKit paints the first frame of a
    // just-opened dialog late (measured 12 Nov 2026: `transitionstart` 390–1380 ms after `transitionrun`,
    // CI 43181605309), so a 400 ms wait read the list before the event had fired.
    const settle = async (): Promise<void> => {
      await page.waitForFunction(() => (window as unknown as { __ended: boolean }).__ended);
    };

    // Full motion: SidePanel and BottomSheet slide while staying opaque (no opacity transition).
    for (const demo of ["panel", "sheet"] as const) {
      await record();
      await trigger(page, demo).click();
      await settle();
      expect(await started()).toEqual(["transform"]);
      await record();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);
      expect(await started()).toEqual(["transform"]);
    }

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
      // Reduced motion: every overlay fades in and out (never pops), and nothing moves.
      await record();
      await trigger(page, demo).click();
      await settle();
      expect(await started(), `${demo} opens with a fade`).toEqual(["opacity"]);
      await record();
      await page.getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);
      expect(await started(), `${demo} closes with a fade`).toEqual(["opacity"]);
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
    test.skip(isMobile, "wheel: desktop projects (touch scroll: the touch-path tests below)");
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

/**
 * AC 11 touch paths, with real touch input (CDP) on the Chromium touch project. WebKit has no touch-drag API
 * in Playwright: the sheet's mouse drags above run there, and the real-iPhone feel is a human check.
 */
test.describe("[P0-09] bottom sheet touch paths", () => {
  test.beforeEach(async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== "chromium" || !isMobile, "CDP touch: the Chromium touch project");
    await page.goto("/dev/ui");
    await expect(trigger(page, "sheet-long")).toBeEnabled();
  });

  type Cdp = Awaited<ReturnType<ReturnType<Page["context"]>["newCDPSession"]>>;
  async function touchDrag(cdp: Cdp, x: number, y0: number, y1: number, steps: number) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: y0, id: 1 }],
    });
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps, id: 1 }],
      });
      await new Promise((r) => setTimeout(r, 16));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  const body = (page: Page) => topDialog(page).locator('[data-part="body"]');
  async function centre(loc: Locator): Promise<{ x: number; y: number }> {
    const b = await loc.boundingBox();
    if (!b) throw new Error("no box");
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  test("[P0-09] touch scroll at the sheet's scroll end leaves the page where it was, and after closing", async ({
    page,
  }) => {
    await open(page, "sheet-long");
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    await body(page).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const cdp = await page.context().newCDPSession(page);
    const c = await centre(body(page));
    // Finger moves up = scroll further down, past the content's end.
    for (let i = 0; i < 3; i++) {
      await cdp.send("Input.synthesizeScrollGesture", {
        x: c.x,
        y: c.y,
        yDistance: -400,
        gestureSourceType: "touch",
        speed: 1200,
      });
    }
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await topDialog(page).getByRole("button", { name: "Close" }).click();
    await expect(page.locator("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test("[P0-09] pulling down on content at its top drags the sheet and closes it", async ({
    page,
  }) => {
    await open(page, "sheet-long");
    expect(await body(page).evaluate((el) => el.scrollTop)).toBe(0);
    const h = await panelOf(page).evaluate((el) => el.getBoundingClientRect().height);
    const c = await centre(body(page));
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, c.x, c.y - 40, c.y - 40 + h * 0.45, 12);
    await expect(page.locator("dialog")).toHaveCount(0);
  });

  test("[P0-09] a drag that starts on scrolled content scrolls the content, not the sheet", async ({
    page,
  }) => {
    await open(page, "sheet-long");
    await body(page).evaluate((el) => {
      el.scrollTop = 300;
    });
    const c = await centre(body(page));
    const cdp = await page.context().newCDPSession(page);
    await touchDrag(cdp, c.x, c.y - 60, c.y + 120, 12);
    await page.waitForTimeout(400);
    await expect(topDialog(page)).toHaveAttribute("data-state", "open");
    const after = await body(page).evaluate((el) => el.scrollTop);
    expect(after).toBeLessThan(300);
    await expect
      .poll(() => panelOf(page).evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  });
});

test.describe("[P0-09] overlay screenshots", () => {
  // One test per width: all three in one test took 15s on macOS WebKit and ran past the 30s test timeout
  // under full-suite load on Windows WebKit (it surfaced as the `open` helper's waitForFunction timing out).
  for (const width of [320, 390, 1440, 0] as const) {
    const label = width > 0 ? String(width) : "native";
    test(`[P0-09] each overlay open at ${width > 0 ? `${label}px` : "the touch project's own size"}`, async ({
      page,
      shoot,
      isMobile,
    }, testInfo) => {
      // chromium + webkit cover the three widths; the touch projects and desktop1440 shoot at their own size.
      const own = isMobile || testInfo.project.name === "desktop1440";
      test.skip(
        own !== (width === 0),
        own ? "shoots at its own size" : "covered by the 320/390/1440 tests",
      );
      if (width > 0) await page.setViewportSize({ width, height: 800 });
      await page.goto("/dev/ui");
      await expect(trigger(page, "modal")).toBeEnabled();
      for (const demo of ["modal", "tall", "panel", "sheet", "sheet-long"] as const) {
        await open(page, demo);
        await shoot(`overlay-${demo}-${label}`, { fullPage: false });
        await topDialog(page).getByRole("button", { name: "Close" }).click();
        await expect(page.locator("dialog")).toHaveCount(0);
      }
    });
  }
});
