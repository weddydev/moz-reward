import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./support/test";
import { CONTRAST_PAIRS } from "../../src/styles/contrast";
import { TOKEN_GROUPS, type TokenKind } from "../../src/styles/tokens";
import type { Locator, Page } from "@playwright/test";

/**
 * P0-08 step C: the token page and contrast table on /dev/ui (AC 1, AC 2), the focus ring (AC 4), reduced
 * motion as the browser computes it (AC 5), layout stability while fonts load (AC 6) and the signed-out
 * choice that follows the customer into their profile (AC 8). The guard fixture adds an axe scan and fails
 * on any console error, CSP violation or hydration warning.
 */
const html = "html";
const ATTR = "data-reduce-motion";

const css = readFileSync(path.join(process.cwd(), "src/styles/tokens.css"), "utf8");
/** First declared value of each custom property in tokens.css (later ones are the reduced-motion overrides). */
const declared = new Map<string, string>();
for (const [, name = "", raw = ""] of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
  if (!declared.has(name)) declared.set(name, raw.replace(/\s+/g, " ").trim());
}
const TOKENS = TOKEN_GROUPS.flatMap((g) => g.tokens.map((t) => ({ name: t.name, kind: g.kind })));

/** A duration in ms, whichever unit the minifier left it in (`120ms`, `.12s`). */
function toMs(value: string): number {
  const m = /^(-?[\d.]+)(ms|s)$/.exec(value.trim());
  if (!m) throw new Error(`not a duration: "${value}"`);
  return Number(m[1]) * (m[2] === "s" ? 1000 : 1);
}

/** Six-digit lower-case hex (`#fff` → `#ffffff`). */
function toHex6(value: string): string {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short
    ? `#${short
        .slice(1)
        .map((c) => `${c}${c}`)
        .join("")}`
    : v;
}

/**
 * One comparable form per kind, so a value still matches after the production CSS minifier rewrote it
 * (`#ffffff` → `#fff`, `120ms` → `.12s`). Null = not compared (gradients, shadows, easings and anything
 * built from another token): those are only required to be present.
 */
function comparable(kind: TokenKind, value: string): string | null {
  if (value.includes("var(") || value.includes("calc(")) return null;
  switch (kind) {
    case "colour":
      return /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(value.trim()) ? toHex6(value) : null;
    case "duration":
      return String(toMs(value));
    case "space":
    case "radius":
    case "size":
    case "number":
      return String(parseFloat(value));
    case "gradient":
    case "shadow":
    case "easing":
      return null;
  }
}

/** The duration a token row shows, in ms; NaN while the value has not filled in yet (so a poll keeps waiting). */
async function shownMs(value: Locator): Promise<number> {
  const text = (await value.innerText()).trim();
  return text === "" ? Number.NaN : toMs(text);
}

async function openGallery(page: Page): Promise<void> {
  await page.goto("/dev/ui");
  // The gallery is the heaviest page (every primitive plus the token list): on a busy machine WebKit needs
  // more than the default 5s to hydrate it. Still well inside the 30s test budget.
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true", { timeout: 15_000 });
  await expect(page.getByTestId("token-page")).toBeVisible();
}

async function shownValues(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>("[data-token]")].map((row) => [
        row.dataset.token ?? "",
        row.querySelector("[data-token-value]")?.textContent ?? "",
      ]),
    ),
  );
}

test.describe("[P0-08] token page and contrast table", () => {
  test("[P0-08] AC1: every token has a row whose value is read from the CSS", async ({ page }) => {
    await openGallery(page);
    await expect(page.locator("[data-token]")).toHaveCount(TOKENS.length);
    // The values fill in after hydration.
    await expect(page.locator('[data-token="bg"] [data-token-value]')).not.toHaveText("");
    const shown = await shownValues(page);

    const empty = TOKENS.filter((t) => !shown[t.name]).map((t) => t.name);
    expect(empty, "tokens with no value on the page").toEqual([]);

    const different: string[] = [];
    let compared = 0;
    for (const { name, kind } of TOKENS) {
      const want = comparable(kind, declared.get(name) ?? "");
      if (want === null) continue;
      compared += 1;
      const got = comparable(kind, shown[name] ?? "");
      if (got !== want)
        different.push(`--${name}: page "${shown[name] ?? ""}", tokens.css "${want}"`);
    }
    expect(different).toEqual([]);
    // Guards the comparison itself: most tokens are plain values.
    expect(compared).toBeGreaterThan(TOKENS.length / 2);
  });

  test("[P0-08] AC1: the values follow the reduced-motion choice", async ({ page }) => {
    await openGallery(page);
    const base = page.locator('[data-token="dur-base"] [data-token-value]');
    await expect.poll(async () => shownMs(base)).toBe(toMs(declared.get("dur-base") ?? ""));

    await page.getByTestId("preference-toggles").getByRole("radio", { name: "Reduced" }).click();
    await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
    await expect.poll(async () => shownMs(base)).toBe(150);
    const fast = page.locator('[data-token="dur-fast"] [data-token-value]');
    await expect.poll(async () => shownMs(fast)).toBe(0);
  });

  test("[P0-08] AC2: the contrast table has every shared pair and none fails", async ({ page }) => {
    await openGallery(page);
    await expect(page.getByTestId("contrast-summary")).toHaveText(
      `${String(CONTRAST_PAIRS.length)} pairs checked, 0 failing.`,
    );
    await expect(page.locator("[data-contrast]")).toHaveCount(CONTRAST_PAIRS.length);
    await expect(page.locator('[data-contrast="pass"]')).toHaveCount(CONTRAST_PAIRS.length);

    // Each row shows its ratio, and the ratio meets the row's own minimum.
    const ratios = await page
      .locator("[data-contrast-ratio]")
      .evaluateAll((cells) => cells.map((c) => parseFloat(c.textContent)));
    expect(ratios).toHaveLength(CONTRAST_PAIRS.length);
    const below = CONTRAST_PAIRS.filter((pair, i) => !((ratios[i] ?? 0) >= pair.min)).map(
      (pair) => pair.use,
    );
    expect(below).toEqual([]);

    // No horizontal page overflow: the wide table scrolls inside its own region.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("[P0-08] screenshots of the token page and contrast table for inspection", async ({
    page,
    shoot,
  }) => {
    await openGallery(page);
    const summary = page.getByTestId("contrast-summary");
    await expect(summary).toContainText("pairs checked");
    await page.getByTestId("token-page").scrollIntoViewIfNeeded();
    await shoot("tokens", { fullPage: false });
    await page.locator('[data-token="space-unit"]').scrollIntoViewIfNeeded();
    await shoot("tokens-space", { fullPage: false });
    await summary.scrollIntoViewIfNeeded();
    await shoot("contrast", { fullPage: false });
    // The whole page too, where the browser can take it (a 3x phone exceeds the 32,767px image limit).
    const tall = await page.evaluate(
      () => document.documentElement.scrollHeight * window.devicePixelRatio,
    );
    if (tall < 32_000) await shoot("gallery");
  });
});

type Motion = { properties: string[]; maxMs: number; moving: number };

/** What the browser computed for an element's transitions, and how many transform transitions are running. */
async function motionOf(target: Locator): Promise<Motion> {
  return target.evaluate((el) => {
    const style = getComputedStyle(el);
    const ms = (v: string): number => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
    return {
      properties: style.transitionProperty.split(",").map((p) => p.trim()),
      maxMs: Math.max(...style.transitionDuration.split(",").map((d) => ms(d.trim()))),
      moving: el
        .getAnimations()
        .filter(
          (a) =>
            a.playState === "running" &&
            a instanceof CSSTransition &&
            ["transform", "translate", "all"].includes(a.transitionProperty),
        ).length,
    };
  });
}

const MOVING = [
  "all",
  "transform",
  "translate",
  "scale",
  "rotate",
  "top",
  "left",
  "right",
  "bottom",
];

function expectStill(name: string, m: Motion): void {
  expect(
    m.properties.filter((p) => MOVING.includes(p)),
    `${name}: properties that would move`,
  ).toEqual([]);
  expect(m.maxMs, `${name}: longest transition`).toBeLessThanOrEqual(150);
  expect(m.moving, `${name}: running transform transitions`).toBe(0);
}

async function expectNothingMoves(page: Page): Promise<void> {
  const switchButton = page.getByRole("switch", { name: "Birthday treat reminders" });
  const switchThumb = switchButton.locator('[data-part="thumb"]');
  const range = page.getByRole("radiogroup", { name: "Date range" });
  const rangeThumb = range.locator('[data-part="thumb"]');

  expectStill("switch thumb", await motionOf(switchThumb));
  expectStill("segmented thumb", await motionOf(rangeThumb));

  // A press lands at its end position at once: read in the same task as the click.
  const afterClick = async (control: Locator, thumb: Locator): Promise<Motion> => {
    await control.click();
    return motionOf(thumb);
  };
  expectStill("switch thumb after a click", await afterClick(switchButton, switchThumb));
  await expect(switchButton).toHaveAttribute("aria-checked", "false");
  expect(
    await switchThumb.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41),
    "switch thumb is at its end position",
  ).toBe(0);
  expectStill(
    "segmented thumb after a click",
    await afterClick(range.getByRole("radio", { name: "90 days" }), rangeThumb),
  );

  await page.getByRole("button", { name: "Success toast" }).click();
  const toast = page.locator("li.toast").first();
  await expect(toast).toBeVisible();
  expectStill("toast", await motionOf(toast));
}

test.describe("[P0-08] AC5: reduced motion", () => {
  test("[P0-08] AC5: with the system setting, nothing moves and fades are at most 150ms", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGallery(page);
    await expect(page.locator(html)).not.toHaveAttribute(ATTR);
    await expectNothingMoves(page);
  });

  test("[P0-08] AC5: with the toggle, nothing moves and fades are at most 150ms", async ({
    page,
  }) => {
    await openGallery(page);
    await page.getByTestId("preference-toggles").getByRole("radio", { name: "Reduced" }).click();
    await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
    await expectNothingMoves(page);
  });

  test('[P0-08] AC5: "Full" keeps the movement although the system asks for less', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGallery(page);
    await page.getByTestId("preference-toggles").getByRole("radio", { name: "Full" }).click();
    await expect(page.locator(html)).toHaveAttribute(ATTR, "false");
    const thumb = page
      .getByRole("switch", { name: "Birthday treat reminders" })
      .locator('[data-part="thumb"]');
    const m = await motionOf(thumb);
    expect(m.properties).toContain("transform");
    expect(m.maxMs).toBe(toMs(declared.get("dur-fast") ?? ""));
  });
});

test("[P0-08] AC8: a choice made signed out is saved to the profile at sign-in", async ({
  page,
  browser,
  signInAs,
  baseURL,
}) => {
  await openGallery(page);
  await page.getByTestId("preference-toggles").getByRole("radio", { name: "Reduced" }).click();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
  // Signed out: kept on this device only.
  expect(await page.evaluate(() => window.localStorage.getItem("moz:motion"))).toBe("reduce");
  expect(await page.evaluate(() => window.localStorage.getItem("moz:prefs-sync"))).not.toBe(
    "synced",
  );

  // A new customer: the profile has no choice yet, so the device's choice is sent to it.
  await signInAs("customer");
  await page.reload();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("moz:prefs-sync")))
    .toBe("synced");

  // Same account in a browser that never saw the choice: it comes from the profile.
  const other = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    storageState: { cookies: await page.context().cookies(), origins: [] },
  });
  try {
    const fresh = await other.newPage();
    await fresh.goto("/dev/ui");
    await expect(fresh.locator(html)).toHaveAttribute(ATTR, "true");
  } finally {
    await other.close();
  }
});

test.describe("[P0-08] AC4: focus ring", () => {
  // Keyboard focus is a desktop behaviour; the phone projects have no Tab key to start it with.
  test.skip(({ isMobile }) => isMobile, "keyboard focus: desktop projects");

  const rgb = (hex: string): string => {
    const n = parseInt(toHex6(hex).slice(1), 16);
    return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
  };
  /** --focus and --focus-ring point at other tokens (ink, gold-500): follow the reference in tokens.css. */
  const tokenHex = (name: string): string => {
    const value = declared.get(name) ?? "";
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    return ref?.[1] ? tokenHex(ref[1]) : value;
  };
  const INK = rgb(tokenHex("focus"));
  const GOLD = rgb(tokenHex("focus-ring"));
  /** Exactly the two rings: ink 2px inside, gold out to 4px (colour first or last, as the browser writes it). */
  const twoRings = (shadow: string): boolean => {
    const parts = shadow.split(/,(?![^(]*\))/).map((p) => p.trim());
    const ring = (part: string | undefined, colour: string, spread: string): boolean =>
      Boolean(part?.includes(colour)) &&
      part?.replace(colour, "").trim() === `0px 0px 0px ${spread}`;
    return parts.length === 2 && ring(parts[0], INK, "2px") && ring(parts[1], GOLD, "4px");
  };

  const RINGS = `${INK} 2px + ${GOLD} 4px`;

  type Shape = { radius: string; box: { x: number; y: number; width: number; height: number } };
  /** Radius and box in document coordinates (focusing may scroll the page; it must not move the element). */
  const shapeOf = (target: Locator): Promise<Shape> =>
    target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        radius: getComputedStyle(el).borderRadius,
        box: {
          x: Math.round(r.x + window.scrollX),
          y: Math.round(r.y + window.scrollY),
          width: r.width,
          height: r.height,
        },
      };
    });

  const targets = (page: Page): Array<{ name: string; target: Locator }> => [
    {
      // The gallery shows "Collect points" as primary, secondary and ghost (in that order).
      name: "gold-button",
      target: page.getByRole("button", { name: "Collect points" }).first(),
    },
    { name: "ink-button", target: page.getByRole("button", { name: "Collect points" }).nth(1) },
    { name: "input", target: page.getByRole("textbox", { name: "Full name" }) },
    { name: "chip", target: page.getByRole("button", { name: "Friendly staff" }) },
  ];

  /** Moves keyboard focus to the element: one Tab starts keyboard mode, which script focus then keeps. */
  async function keyboardFocus(page: Page, target: Locator): Promise<void> {
    await target.scrollIntoViewIfNeeded();
    await page.keyboard.press("Tab");
    await target.focus();
    await expect(target).toBeFocused();
    expect(await target.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  }

  test("[P0-08] AC4: ink ring and 2px gold outer ring on a gold button, ink button, input and chip", async ({
    page,
  }, testInfo) => {
    await openGallery(page);
    const dir = path.join(".artifacts", "screens", "P0-08");
    mkdirSync(dir, { recursive: true });

    for (const { name, target } of targets(page)) {
      await target.scrollIntoViewIfNeeded();
      const before = await shapeOf(target);
      await keyboardFocus(page, target);
      // The shadow may fade in (≤ 120ms): wait for its end value.
      await expect
        .poll(
          async () => {
            const shadow = await target.evaluate((el) => getComputedStyle(el).boxShadow);
            return twoRings(shadow) ? RINGS : shadow;
          },
          { message: `${name}: box-shadow is the two rings only (not the component's own shadow)` },
        )
        .toBe(RINGS);
      const after = await shapeOf(target);
      expect(after, `${name}: same radius and box when focused`).toEqual(before);

      const box = await target.boundingBox();
      if (!box) throw new Error(`${name} has no box`);
      await page.screenshot({
        path: path.join(dir, `focus-${name}--${testInfo.project.name}.png`),
        clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
        animations: "disabled",
        caret: "initial",
      });
    }
  });

  test("[P0-08] forced-colours mode still draws a focus outline", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "forced-colours emulation: Chromium");
    await page.emulateMedia({ forcedColors: "active" });
    await openGallery(page);
    for (const { name, target } of targets(page)) {
      await keyboardFocus(page, target);
      const outline = await target.evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.outlineStyle, width: s.outlineWidth, colour: s.outlineColor };
      });
      expect(outline.style, `${name}: outline style`).toBe("solid");
      expect(outline.width, `${name}: outline width`).toBe("2px");
      // Forced colours replace the transparent author colour with a system colour.
      expect(outline.colour, `${name}: outline colour`).not.toMatch(
        /rgba\(0, 0, 0, 0\)|transparent/,
      );
    }
    await page.emulateMedia({ forcedColors: "none" });
  });
});

const FONT = /\/_next\/static\/media\/.*\.woff2(\?.*)?$/;

/** Sum of layout shifts not caused by input, from navigation until the page and its fonts have settled. */
async function clsOf(page: Page): Promise<number> {
  page.on("console", (m) => {
    if (m.text().startsWith("[P0-08] layout shifts")) console.warn(m.text());
  });
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator('[data-token="bg"] [data-token-value]')).not.toHaveText("");
  return page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return new Promise<number>((resolve) => {
      let total = 0;
      const moved: string[] = [];
      type Shift = PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
        sources?: Array<{
          node: Node | null;
          previousRect: DOMRectReadOnly;
          currentRect: DOMRectReadOnly;
        }>;
      };
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Shift[]) {
          if (entry.hadRecentInput) continue;
          total += entry.value;
          for (const s of entry.sources ?? []) {
            const el = s.node instanceof Element ? s.node : s.node?.parentElement;
            moved.push(
              `${entry.value.toFixed(4)} @${String(Math.round(entry.startTime))}ms <${el?.tagName.toLowerCase() ?? "?"} class="${(el?.getAttribute("class") ?? "").slice(0, 60)}"> "${(el?.textContent ?? "").slice(0, 40)}" y ${String(Math.round(s.previousRect.y))}→${String(Math.round(s.currentRect.y))} h ${String(Math.round(s.previousRect.height))}→${String(Math.round(s.currentRect.height))}`,
            );
          }
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      // Buffered entries are delivered in the next task.
      setTimeout(() => {
        observer.disconnect();
        // What moved, for the failure report (console.warn is not a guard problem).
        if (total > 0.001) console.warn(`[P0-08] layout shifts:\n${moved.join("\n")}`);
        resolve(total);
      }, 100);
    });
  });
}

const WIDTHS = [320, 390, 1440] as const;

test.describe("[P0-08] AC6: layout stability", () => {
  // The Layout Instability API exists in Chromium only; one project measures all three widths.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "layout-shift: Chromium");
  });

  for (const width of WIDTHS) {
    test(`[P0-08] AC6: CLS ≤ 0.01 at ${String(width)}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/dev/ui");
      const cls = await clsOf(page);
      testInfo.annotations.push({
        type: "cls",
        description: `${String(width)}px: ${cls.toFixed(4)}`,
      });
      console.warn(`[P0-08] CLS at ${String(width)}px: ${cls.toFixed(4)}`);
      expect(cls).toBeLessThanOrEqual(0.01);
    });

    test(`[P0-08] AC6: CLS stays "good" (≤ 0.1) at ${String(width)}px when the fonts arrive 1.5s late`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      let fonts = 0;
      await page.route(FONT, async (route) => {
        fonts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });
      await page.goto("/dev/ui");
      const cls = await clsOf(page);
      console.warn(`[P0-08] CLS at ${String(width)}px, fonts 1.5s late: ${cls.toFixed(4)}`);
      expect(fonts, "font requests held").toBeGreaterThan(0);
      // `display: swap` shows the metric-matched fallback first; when the real font lands, a line that was
      // within a few percent of its column can re-wrap (measured: 0.048 at 390, 0.009 at 1440). That is the
      // price of swap (DECISIONS "P0-08 fonts"); the bound here is the Web Vitals "good" limit.
      expect(cls).toBeLessThanOrEqual(0.1);
    });
  }

  test.describe("fonts blocked", () => {
    // One pattern: a two-item array would be read by Playwright as [value, options].
    test.use({
      guardAllow: [/^requestfailed: .*\.woff2|^console: Failed to load resource: net::ERR_FAILED/],
    });

    for (const width of WIDTHS) {
      test(`[P0-08] AC6: CLS ≤ 0.01 at ${String(width)}px when the fonts fail to load`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        let fonts = 0;
        await page.route(FONT, async (route) => {
          fonts += 1;
          await route.abort();
        });
        await page.goto("/dev/ui");
        const cls = await clsOf(page);
        console.warn(`[P0-08] CLS at ${String(width)}px, fonts blocked: ${cls.toFixed(4)}`);
        expect(fonts, "font requests blocked").toBeGreaterThan(0);
        expect(cls).toBeLessThanOrEqual(0.01);
        // The fallback font is in use: the page is readable without the web fonts.
        await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
      });
    }
  });

  test("[P0-08] screenshots at 320 and 390 for inspection", async ({ page, shoot }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await openGallery(page);
      const summary = page.getByTestId("contrast-summary");
      await expect(summary).toContainText("pairs checked");
      await shoot(`gallery-top-${String(width)}`, { fullPage: false });
      await page.getByTestId("token-page").scrollIntoViewIfNeeded();
      await shoot(`tokens-${String(width)}`, { fullPage: false });
      await summary.scrollIntoViewIfNeeded();
      await shoot(`contrast-${String(width)}`, { fullPage: false });
    }
  });
});

/**
 * Visual snapshot of the token page (390 and 1440). Tagged @visual: left out of ordinary runs and CI
 * (playwright.config `grepInvert`), included when VISUAL=1, which `pnpm gate:phase` sets. Baselines are per
 * operating system (font rendering differs), so each developer laptop keeps its own beside this spec.
 */
test.describe("[P0-08] token page visual snapshot", { tag: "@visual" }, () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one browser holds the baseline");
  });

  for (const width of [390, 1440] as const) {
    test(`[P0-08] token page and contrast table look as approved at ${String(width)}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openGallery(page);
      await expect(page.getByTestId("contrast-summary")).toContainText("pairs checked");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByTestId("token-page")).toHaveScreenshot(
        `token-page-${String(width)}.png`,
        {
          animations: "disabled",
          caret: "initial",
          maxDiffPixelRatio: 0.002,
        },
      );
    });
  }
});
