import { expect, test } from "./support/test";
import { GALLERY_PRIMITIVES } from "../../src/features/dev/gallery-list";
import type { Page, Route } from "@playwright/test";

/**
 * /dev/ui acceptance criteria (P0-09 step D): AC 1, 3–7, 9, 10, 12 (C-13), 13 (C-20). Overlays (AC 2, 3 inside
 * dialogs, 11) are in overlays.spec.ts.
 */

async function settle(page: Page): Promise<void> {
  // Controls disabled until hydration fade in once enabled; measure the settled page.
  await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
}

async function gallery(page: Page): Promise<void> {
  await page.goto("/dev/ui");
  await settle(page);
}

const block = (page: Page, name: string) => page.locator(`[data-primitive="${name}"]`);

test.describe("[P0-09] UI gallery states", () => {
  test("[P0-09] AC1: a block with a heading for every primitive in the gallery list", async ({
    page,
  }) => {
    await gallery(page);
    for (const name of GALLERY_PRIMITIVES) {
      await expect(block(page, name), name).toHaveCount(1);
      await expect(
        block(page, name).getByRole("heading", { level: 3, name, exact: true }),
      ).toBeVisible();
    }
    expect(await page.locator("[data-primitive]").count()).toBe(GALLERY_PRIMITIVES.length);
  });

  test("[P0-09] AC3: Tab reaches every enabled control once, in DOM order; no positive tabindex", async ({
    page,
    isMobile,
    browserName,
  }) => {
    test.skip(isMobile, "keyboard: desktop projects");
    test.setTimeout(90_000);
    await gallery(page);
    // Safari's Tab skips links unless "Press Tab to highlight each item" is on (Option+Tab reaches them).
    const skipLinks = browserName === "webkit";
    const expected = await page.evaluate((skipLinks) => {
      const radioPicked = new Set<string>();
      const all = [
        ...document.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, summary, [tabindex]",
        ),
      ];
      const tabbable = all.filter((el) => {
        if (el.closest("[inert]") || el.closest("dialog")) return false;
        if (skipLinks && el instanceof HTMLAnchorElement) return false;
        if ("disabled" in el && (el as HTMLButtonElement).disabled) return false;
        if (el.closest("fieldset:disabled")) return false;
        if (el.tabIndex < 0) return false;
        if (el.getClientRects().length === 0) return false;
        if (getComputedStyle(el).visibility === "hidden") return false;
        if (el instanceof HTMLInputElement && el.type === "radio") {
          const group = [
            ...document.querySelectorAll<HTMLInputElement>(
              `input[type=radio][name="${CSS.escape(el.name)}"]`,
            ),
          ].filter((r) => !r.disabled);
          const pick = group.find((r) => r.checked) ?? group[0];
          if (pick !== el || radioPicked.has(el.name)) return false;
          radioPicked.add(el.name);
        }
        return true;
      });
      tabbable.forEach((el, i) => {
        el.dataset.tabProbe = String(i);
      });
      const positive = [...document.querySelectorAll<HTMLElement>("[tabindex]")].filter(
        (el) => el.tabIndex > 0,
      ).length;
      return { count: tabbable.length, positive };
    }, skipLinks);
    expect(expected.positive).toBe(0);
    expect(expected.count).toBeGreaterThan(60);

    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });
    const seen: string[] = [];
    for (let i = 0; i < expected.count + 3; i++) {
      await page.keyboard.press("Tab");
      const probe = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return "body";
        return (
          el.dataset.tabProbe ??
          `unexpected <${el.tagName.toLowerCase()}> ${el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 40)}`
        );
      });
      if (probe === "body" || (probe === "0" && seen.length > 0)) break;
      seen.push(probe);
    }
    expect(seen).toEqual(Array.from({ length: expected.count }, (_, i) => String(i)));
  });

  test("[P0-09] AC4: every interactive element at 390 has a 44×44 hit area (hit-tested)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gallery(page);
    const misses = await page.evaluate(() => {
      const els = [
        ...document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, summary, [role="tab"], [role="switch"]',
        ),
      ].filter((el) => {
        if (el.closest("[inert]") || el.closest("dialog")) return false;
        if ("disabled" in el && (el as HTMLButtonElement).disabled) return false;
        if (el.getClientRects().length === 0) return false;
        // Visually hidden until focused (the skip link): a keyboard affordance, not a pointer target.
        if (getComputedStyle(el).clipPath === "inset(50%)") return false;
        // Links inside a sentence are the one exception (WCAG 2.5.8 inline).
        if (el instanceof HTMLAnchorElement && el.parentElement?.tagName === "P") {
          const text = el.parentElement.textContent.trim();
          if (text.length > el.textContent.trim().length) return false;
        }
        return true;
      });
      const hits = (el: HTMLElement, h: Element | null): boolean => {
        if (!h) return false;
        if (el === h || el.contains(h)) return true;
        const label = h.closest("label");
        return !!label && (label.control === el || label.contains(el));
      };
      /*
       * Hit-testing rounds the point to a whole pixel and boxes snap to the pixel grid, so the hit area is
       * measured exactly by counting whole-pixel points on the lines through the centre that land on the
       * control: a 44px hit area gives 44 in each direction, a 43px one 43.
       */
      const span = (el: HTMLElement, x0: number, y0: number, dx: number, dy: number): number => {
        let n = 0;
        for (let d = 1; d <= 40; d++) {
          if (!hits(el, document.elementFromPoint(x0 + dx * d, y0 + dy * d))) break;
          n++;
        }
        return n;
      };
      const out: string[] = [];
      for (const el of els) {
        el.scrollIntoView({ block: "center", inline: "center" });
        // A native checkbox/radio sits inside its row label: the row is the target (AC 8).
        const target =
          el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
            ? (el.closest("label") ?? el)
            : el;
        const box = target.getBoundingClientRect();
        const cx = Math.round(box.left + box.width / 2);
        const cy = Math.round(box.top + box.height / 2);
        const centre = hits(el, document.elementFromPoint(cx, cy)) ? 1 : 0;
        const w = centre + span(el, cx, cy, -1, 0) + span(el, cx, cy, 1, 0);
        const h = centre + span(el, cx, cy, 0, -1) + span(el, cx, cy, 0, 1);
        if (centre === 0 || w < 44 || h < 44) {
          const labelledBy = el.getAttribute("aria-labelledby");
          const name =
            el.getAttribute("aria-label") ??
            (labelledBy ? document.getElementById(labelledBy)?.textContent : null) ??
            (el as HTMLInputElement).labels?.[0]?.textContent ??
            (el.closest("label")?.textContent ?? el.textContent).trim().slice(0, 40);
          const where = el.closest("[data-primitive]")?.getAttribute("data-primitive") ?? "page";
          out.push(
            `${where} <${el.tagName.toLowerCase()}> "${name}" hit area ${String(w)}×${String(h)}`,
          );
        }
      }
      return out;
    });
    expect(misses).toEqual([]);
  });

  for (const reduced of [false, true]) {
    test(`[P0-09] AC5: press feedback within 150ms${reduced ? " (reduced motion: no transform, dim)" : " (scale .97)"}`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "mouse press: desktop projects (real iPhone feel: H-task)");
      test.setTimeout(90_000);
      if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      await gallery(page);
      const count = await page.evaluate(() => {
        const els = [
          ...document.querySelectorAll<HTMLElement>(".pressable, .btn-gold, [data-press]"),
        ]
          .map((el) => (el.matches("[data-press]") ? el.parentElement : el))
          .filter((el): el is HTMLElement => {
            if (!el || el.closest("[inert]") || el.closest("dialog")) return false;
            if ("disabled" in el && (el as HTMLButtonElement).disabled) return false;
            if (
              el.getAttribute("aria-disabled") === "true" ||
              el.getAttribute("aria-busy") === "true"
            )
              return false;
            return el.getClientRects().length > 0;
          });
        [...new Set(els)].forEach((el, i) => {
          el.dataset.pressProbe = String(i);
        });
        return new Set(els).size;
      });
      expect(count).toBeGreaterThan(30);
      const failures: string[] = [];
      for (let i = 0; i < count; i++) {
        const el = page.locator(`[data-press-probe="${String(i)}"]`);
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        if (!box) continue;
        // Timed inside the page. The press must be driven by CSS from pointerdown: the transition that
        // carries it (transform, or opacity under reduced motion) has delay + duration ≤ 150ms. That is read
        // from the running CSSTransition, so a busy runner's late frames can't fail it (two flakes at 162 and
        // 214ms with 5 browsers in parallel); the wall clock from pointerdown to the first frame that shows
        // the press only has to stay under 300ms, which still catches a press deferred by script.
        await page.evaluate(
          ({ i, reduced }) => {
            const w = window as unknown as { __press?: unknown };
            delete w.__press;
            const host = document.querySelector<HTMLElement>(`[data-press-probe="${String(i)}"]`);
            const visible = host?.querySelector<HTMLElement>(":scope > [data-press]") ?? host;
            window.addEventListener(
              "pointerdown",
              (e) => {
                const down = e.timeStamp;
                let planned: number | null = null;
                const check = (now: number) => {
                  const t = visible
                    ?.getAnimations()
                    .find(
                      (a) =>
                        (a as CSSTransition).transitionProperty ===
                        (reduced ? "opacity" : "transform"),
                    );
                  if (t && planned === null) {
                    const timing = t.effect?.getComputedTiming();
                    planned = (timing?.delay ?? 0) + Number(timing?.duration ?? 0);
                  }
                  const cs = visible ? getComputedStyle(visible) : null;
                  const transform = cs?.transform ?? "none";
                  const opacity = cs?.opacity ?? "1";
                  const scale = transform.startsWith("matrix(")
                    ? Number.parseFloat(transform.slice(7))
                    : 1;
                  const ok = reduced
                    ? transform === "none" && Number.parseFloat(opacity) < 1
                    : Math.abs(scale - 0.97) < 0.002;
                  const ms = now - down;
                  if (ok || ms > 400) w.__press = { ok, ms, planned, transform, opacity };
                  else requestAnimationFrame(check);
                };
                requestAnimationFrame(check);
              },
              { once: true, capture: true },
            );
          },
          { i, reduced },
        );
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        const handle = await page.waitForFunction(
          () => (window as unknown as { __press?: unknown }).__press,
        );
        const result = (await handle.jsonValue()) as {
          ok: boolean;
          ms: number;
          /** delay + duration of the press transition; null when the change was instant (no transition). */
          planned: number | null;
          transform: string;
          opacity: string;
        };
        // Release away from the control so the press doesn't open overlays or fire handlers.
        await page.mouse.move(2, 2);
        await page.mouse.up();
        if (!result.ok || (result.planned ?? 0) > 150 || result.ms > 300) {
          const name = await el.evaluate((n) =>
            (n.getAttribute("aria-label") ?? n.textContent).trim().slice(0, 30),
          );
          failures.push(
            `"${name}" ${result.ok ? `planned ${String(result.planned)}ms, seen at ${result.ms.toFixed(0)}ms` : `${result.transform} opacity ${result.opacity}`}`,
          );
        }
      }
      expect(failures).toEqual([]);
    });
  }

  test("[P0-09] AC6: 320px with long text — no page scroll; wide content scrolls inside itself", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gallery(page);
    const result = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const scrollsX = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        return ["auto", "scroll", "hidden", "clip"].includes(cs.overflowX);
      };
      const escaped: string[] = [];
      for (const el of document.querySelectorAll("main *")) {
        if (el.closest("dialog") || el.closest(".sr-only")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.right <= vw + 0.5) continue;
        // Fine if a clipping/scrolling ancestor inside the viewport contains it.
        let a = el.parentElement;
        let contained = false;
        while (a && a !== document.body) {
          if (scrollsX(a) && a.getBoundingClientRect().right <= vw + 0.5) {
            contained = true;
            break;
          }
          a = a.parentElement;
        }
        if (!contained)
          escaped.push(
            `${el.tagName.toLowerCase()}.${String(el.getAttribute("class")).slice(0, 40)}`,
          );
      }
      const innerScroller = (el: Element | null): boolean => {
        let a: Element | null = el;
        while (a && a !== document.body) {
          const cs = getComputedStyle(a);
          if (["auto", "scroll"].includes(cs.overflowX) && a.scrollWidth > a.clientWidth)
            return true;
          a = a.parentElement;
        }
        return false;
      };
      const tablists = document.querySelectorAll('[data-primitive="Tabs"] [role="tablist"]');
      const chipRow = document.querySelectorAll('[data-primitive="ChipGroup"] [role="group"]')[1];
      const firstChip = chipRow?.querySelector("button") ?? null;
      return {
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        escaped: escaped.slice(0, 10),
        tableScrolls: innerScroller(
          document.querySelector('[data-primitive="Table"] [role="region"] table'),
        ),
        manyTabsScroll: innerScroller(tablists[1]?.querySelector('[role="tab"]') ?? null),
        chipRowScrolls: innerScroller(firstChip),
      };
    });
    expect(result.pageOverflow).toBeLessThanOrEqual(0);
    expect(result.escaped).toEqual([]);
    expect(result.tableScrolls).toBe(true);
    expect(result.manyTabsScroll).toBe(true);
    expect(result.chipRowScrolls).toBe(true);

    // SegmentedControl labels sit on one line in their 40px pill and are shown in full at 320.
    const segments = page.locator('[role="radiogroup"] > button[role="radio"]');
    expect(await segments.count()).toBeGreaterThan(0);
    for (const seg of await segments.all()) {
      const fit = await seg.evaluate((el) => {
        // Line boxes of the label text (the hit-44 ::after makes the button's own scroll size larger).
        const range = document.createRange();
        range.selectNodeContents((el.firstElementChild ?? el).firstChild ?? el);
        const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        return {
          label: el.textContent,
          oneLine: tops.size === 1,
          // The label span truncates as a last resort; shown in full means it didn't need to.
          whole:
            (el.firstElementChild ?? el).scrollWidth <=
            (el.firstElementChild ?? el).clientWidth + 0.5,
        };
      });
      expect(fit, fit.label).toEqual({ label: fit.label, oneLine: true, whole: true });
    }

    // A table's empty-row message stays inside the visible part of its scroll region, with padding,
    // even when the columns make the table wider than the screen.
    const emptyCells = page.locator('[data-primitive="Table"] [role="region"] td[colspan]');
    expect(await emptyCells.count()).toBeGreaterThan(0);
    for (const cell of await emptyCells.all()) {
      const box = await cell.evaluate((td) => {
        const region = td.closest('[role="region"]');
        // Measure the text itself (not its padded box): the union of every text node's rects.
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        let left = Infinity;
        let right = -Infinity;
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const rect of range.getClientRects()) {
            left = Math.min(left, rect.left);
            right = Math.max(right, rect.right);
          }
        }
        const r = region?.getBoundingClientRect();
        return r && left < right ? { left: left - r.left, right: r.right - right } : null;
      });
      expect(box?.left).toBeGreaterThanOrEqual(16);
      expect(box?.right).toBeGreaterThanOrEqual(16);
    }

    // £1,234,567.89 in a two-column grid fits its card.
    const kpi = page.locator('[data-fixture="kpi-large"]').getByText("£1,234,567.89");
    const fits = await kpi.evaluate((el) => {
      const card = el.closest("[class*='rounded']") ?? el.parentElement;
      const r = el.getBoundingClientRect();
      const c = card?.getBoundingClientRect();
      return !!c && r.right <= c.right + 0.5 && el.scrollWidth <= el.clientWidth + 0.5;
    });
    expect(fits).toBe(true);
  });

  test("[P0-09] AC7: every :hover rule in the built CSS sits inside (hover: hover) and (pointer: fine)", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "built CSS is the same for every browser");
    await gallery(page);
    const loose = await page.evaluate(() => {
      const out: string[] = [];
      const walk = (rules: CSSRuleList, fine: boolean): void => {
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule) {
            const t = rule.conditionText.replace(/\s+/g, " ");
            walk(
              rule.cssRules,
              fine || (t.includes("hover: hover") && t.includes("pointer: fine")),
            );
          } else if (rule instanceof CSSStyleRule) {
            if (rule.selectorText.includes(":hover") && !fine) out.push(rule.selectorText);
            if (rule.cssRules.length > 0) walk(rule.cssRules, fine);
          } else if ("cssRules" in rule) {
            walk((rule as CSSGroupingRule).cssRules, fine);
          }
        }
      };
      for (const sheet of document.styleSheets) walk(sheet.cssRules, false);
      return out;
    });
    expect(loose).toEqual([]);
  });

  test("[P0-09] AC7: a tap leaves no hover style behind (touch project)", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "touch projects");
    await gallery(page);
    const ghost = block(page, "Button").getByRole("button", { name: "Collect points" }).nth(2);
    const before = await ghost.evaluate((el) => getComputedStyle(el).backgroundColor);
    await ghost.tap();
    await page.waitForTimeout(200);
    expect(await ghost.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(before);
  });

  test("[P0-09] AC9: Table — sticky header, density, empty row, same-height loading rows, keyboard rows", async ({
    page,
    isMobile,
  }) => {
    // Wide enough that every row is one line (at 320 a name wraps and its row grows, as it should).
    await page.setViewportSize({ width: 1440, height: 900 });
    await gallery(page);
    const table = block(page, "Table");
    const first = table.getByRole("region", { name: "Customers", exact: true });
    const loading = table.getByRole("region", { name: "Customers (loading)" });
    const none = table.getByRole("region", { name: "Customers (none yet)" });
    const many = table.getByRole("region", { name: "All customers" });

    // Columns sit at the same places whether the table is loading, empty or full: when data arrives
    // nothing shifts sideways either. The four gallery tables share one column list.
    const columnEdges = (region: typeof first): Promise<number[]> =>
      region.locator("thead th").evaluateAll((ths) => {
        const t = ths[0]?.closest("table")?.getBoundingClientRect().left ?? 0;
        return ths.map((th) => Math.round(th.getBoundingClientRect().left - t));
      });
    const dataEdges = await columnEdges(first);
    expect(dataEdges.length).toBeGreaterThan(1);
    for (const region of [loading, none, many])
      expect(await columnEdges(region)).toEqual(dataEdges);

    // Sticky header inside its own scroll region.
    await many.evaluate((el) => {
      el.scrollTop = 300;
    });
    const sticky = await many.evaluate((el) => {
      const th = el.querySelector("thead th");
      return {
        scrolled: el.scrollTop,
        delta: Math.abs((th?.getBoundingClientRect().top ?? -999) - el.getBoundingClientRect().top),
      };
    });
    expect(sticky.scrolled).toBeGreaterThan(0);
    expect(sticky.delta).toBeLessThanOrEqual(1);

    // Loading rows are the height of data rows (no shift when data arrives), in both densities.
    const rowHeight = (region: typeof first) =>
      region.evaluate((el) => el.querySelector("tbody tr")?.getBoundingClientRect().height ?? 0);
    expect(await loading.getAttribute("aria-busy")).toBe("true");
    expect(Math.abs((await rowHeight(loading)) - (await rowHeight(first)))).toBeLessThanOrEqual(
      0.5,
    );
    // …and a one-line data row is exactly the row minimum (52px): content that outgrows it would make data
    // rows taller than skeleton rows on platforms with larger font metrics (CI 43005714982, Linux: 49 vs 48).
    expect(Math.abs((await rowHeight(first)) - 52)).toBeLessThanOrEqual(0.5);

    // Density toggle: compact rows are shorter, and the toggle reports its state.
    const comfy = await rowHeight(first);
    // The toggle sits in the table's own header bar, two levels above its scroll region.
    const toggle = first.locator("xpath=../..").getByRole("button", { name: "Compact rows" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(await rowHeight(first)).toBeLessThan(comfy);

    // Empty row.
    await expect(none.getByText("No customers yet.", { exact: false })).toBeVisible();

    // Keyboard: rows with an action are focusable and open with Enter and Space.
    test.skip(isMobile, "keyboard: desktop projects");
    const row = first.getByRole("button", { name: "Open Aisha Khan" });
    await row.focus();
    await expect(row).toBeFocused();
    const notes = page.getByRole("region", { name: "Notifications" });
    await page.keyboard.press("Enter");
    await expect(notes.getByText("Open Aisha Khan")).toHaveCount(1);
    await page.keyboard.press(" ");
    await expect(notes.getByText("Open Aisha Khan")).toHaveCount(2);
  });

  test("[P0-09] C-13 (AC12): 320px — ShopCard names wrap on words (≤ 2 lines); table scroll hint follows the content; Spinner holds still under reduced motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gallery(page);
    const names = await block(page, "ShopCard")
      .locator("p.text-h3")
      .evaluateAll((els) =>
        els.map((el) => {
          const text = el.textContent;
          const node = el.firstChild;
          const lineStarts: number[] = [];
          let lastTop = Number.NEGATIVE_INFINITY;
          if (node?.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            for (let i = 0; i < text.length; i++) {
              range.setStart(node, i);
              range.setEnd(node, i + 1);
              const rect = [...range.getClientRects()].find((r) => r.width > 0);
              if (!rect) continue;
              if (rect.top > lastTop + 2) {
                if (lastTop !== Number.NEGATIVE_INFINITY) lineStarts.push(i);
                lastTop = rect.top;
              }
            }
          }
          const lh = Number.parseFloat(getComputedStyle(el).lineHeight);
          const visibleLines = Math.round(el.getBoundingClientRect().height / lh);
          return {
            text,
            visibleLines,
            clipped: el.scrollHeight > el.clientHeight + 1,
            midWordBreaks: lineStarts.filter((i) => !/\s/.test(text[i - 1] ?? " ")).length,
            longestWord: Math.max(...text.split(/\s+/).map((w) => w.length)),
          };
        }),
      );
    for (const n of names) {
      expect(n.visibleLines, n.text).toBeLessThanOrEqual(2);
      // Ordinary names break only between words; only a word longer than the line may break inside.
      if (n.longestWord < 25) expect(n.midWordBreaks, n.text).toBe(0);
    }
    const short = names.find((n) => n.text === "Brew & Bloom Café");
    expect(short?.clipped).toBe(false);

    const region = block(page, "Table").getByRole("region", { name: "Customers", exact: true });
    await expect(region).toHaveAttribute("data-overflow", "end");
    await region.evaluate((el) => {
      el.scrollLeft = 40;
    });
    await expect(region).toHaveAttribute("data-overflow", "both");
    await region.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(region).toHaveAttribute("data-overflow", "start");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(region).toHaveAttribute("data-overflow", "none");

    const spinner = block(page, "Spinner").locator(".spinner").first();
    const s = await spinner.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        animation: cs.animationName,
        running: el.getAnimations().some((a) => a.playState === "running"),
        visible: cs.visibility === "visible" && Number.parseFloat(cs.opacity) > 0,
      };
    });
    expect(s.running).toBe(false);
    expect(s.visible).toBe(true);
  });

  test("[P0-09] C-20 (AC13): with JS chunks held, interactive primitives are disabled or inert; once hydrated they work and an early native choice is kept", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const held: Route[] = [];
    let holding = true;
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      if (holding) held.push(route);
      else await route.continue();
    });
    await page.goto("/dev/ui", { waitUntil: "domcontentloaded" });
    // The /dev gate streams the page in a Suspense boundary: Chromium reveals it before the JS runs, WebKit
    // keeps it in React's hidden placeholder until then (nothing can be pressed: "hidden" counts as safe).
    await expect(page.locator("h1", { hasText: "UI gallery" })).toBeAttached();

    const live = await page.evaluate(() => {
      const blocks = [
        "Tabs",
        "Chip",
        "ChipGroup",
        "Switch",
        "SegmentedControl",
        "Checkbox",
        "RadioGroup",
        "Select",
        "Table",
        "Toaster",
        "Modal",
        "SidePanel",
        "BottomSheet",
        "ErrorState",
        "IconButton",
      ];
      const out: string[] = [];
      for (const name of blocks) {
        const root = document.querySelector(`[data-primitive="${name}"]`);
        if (!root) {
          out.push(`${name}: no block`);
          continue;
        }
        for (const el of root.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, [role="tab"], [role="switch"]',
        )) {
          const off =
            el.closest("[hidden]") !== null ||
            (el as HTMLButtonElement).disabled ||
            el.closest("fieldset:disabled") !== null ||
            el.closest("[inert]") !== null ||
            el.getAttribute("aria-disabled") === "true";
          if (!off) {
            const field = el as HTMLInputElement;
            const label = (
              el.getAttribute("aria-label") ??
              field.labels?.[0]?.textContent ??
              el.closest("label")?.textContent ??
              el.textContent
            )
              .trim()
              .slice(0, 40);
            out.push(`${name}: <${el.tagName.toLowerCase()}> ${label}`);
          }
        }
      }
      return out;
    });
    // Uncontrolled native controls stay usable: the browser keeps their state through hydration.
    const UNCONTROLLED = [
      "Select: <select> Region",
      "Select: <select> Long selected option",
      "Checkbox: <input> Long label",
      "RadioGroup: <input> Monthly",
      "RadioGroup: <input> Yearly",
      // No handler: a press before hydration has nothing to lose.
      "IconButton: <button> Settings",
    ];
    const unexpected = live.filter((l) => !UNCONTROLLED.some((u) => l.startsWith(u)));
    expect(unexpected).toEqual([]);

    // Make an early native choice where the page is shown, then let the page hydrate.
    const plan = block(page, "RadioGroup").getByRole("radio", { name: "Yearly" });
    const shownEarly = await plan.isVisible();
    if (shownEarly) await plan.check();
    expect(held.length).toBeGreaterThan(0);
    holding = false;
    for (const r of held.splice(0)) await r.continue();
    await settle(page);
    if (shownEarly) await expect(plan).toBeChecked();

    // Hydrated controls respond.
    const chip = block(page, "ChipGroup").getByRole("button", { name: "Clean" });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    const sw = block(page, "Switch").getByRole("switch", { name: "Sounds" });
    await sw.click();
    await expect(sw).toBeChecked();
    await block(page, "Tabs")
      .getByRole("tab", { name: /Expired/ })
      .first()
      .click();
    await expect(block(page, "Tabs").getByText("Showing: expired")).toBeVisible();
  });
});

test.describe("[P0-09] toasts (AC10)", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await gallery(page);
  });
  const notes = (page: Page) => page.getByRole("region", { name: "Notifications" });
  const shown = (page: Page) =>
    notes(page).locator("li:not([data-leaving='true']) [data-part='message']").allTextContents();

  test("[P0-09] at most 3 visible; the rest wait and appear in order; none dropped", async ({
    page,
  }) => {
    await page.locator('[data-toast-trigger="Five toasts"]').click();
    await expect.poll(() => shown(page)).toEqual(["Toast 1", "Toast 2", "Toast 3"]);
    await page.clock.runFor(4_100);
    await expect.poll(() => shown(page)).toEqual(["Toast 4", "Toast 5"]);
    await page.clock.runFor(4_100);
    await expect.poll(() => shown(page)).toEqual([]);
  });

  test("[P0-09] the same message twice shows twice; errors are alerts, the rest polite", async ({
    page,
  }) => {
    await page.locator('[data-toast-trigger="Same message twice"]').click();
    await expect.poll(() => shown(page)).toEqual(["Saved", "Saved"]);
    await page.locator('[data-toast-trigger="Error toast"]').click();
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toHaveCount(
      1,
    );
    await expect(page.getByRole("status").filter({ hasText: "Something went wrong" })).toHaveCount(
      0,
    );
  });

  test("[P0-09] the 4 s timer pauses on hover, on focus and while the tab is hidden", async ({
    page,
    isMobile,
  }) => {
    // Hover.
    await page.locator('[data-toast-trigger="Info toast"]').click();
    // By text: with the clock faked, a toast that is leaving stays in the list until the clock moves on.
    const live = (text: string) =>
      notes(page).locator("li:not([data-leaving='true'])", { hasText: text });
    const item = live("Saved");
    if (!isMobile) {
      await item.hover();
      await page.clock.runFor(6_000);
      await expect.poll(() => shown(page)).toEqual(["Saved"]);
      await page.mouse.move(2, 2);
    }
    await page.clock.runFor(4_100);
    await expect.poll(() => shown(page)).toEqual([]);

    // Focus.
    await page.locator('[data-toast-trigger="Success toast"]').click();
    await live("+80 gold added").getByRole("button").focus();
    await page.clock.runFor(6_000);
    await expect.poll(() => shown(page)).toEqual(["+80 gold added"]);
    await page.locator('[data-toast-trigger="Success toast"]').focus();
    await page.clock.runFor(4_100);
    await expect.poll(() => shown(page)).toEqual([]);

    // Hidden tab.
    await page.locator('[data-toast-trigger="Info toast"]').click();
    await page.mouse.move(2, 2);
    await page.locator('[data-toast-trigger="Info toast"]').blur();
    const setHidden = (hidden: boolean) =>
      page.evaluate((h) => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => (h ? "hidden" : "visible"),
        });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, hidden);
    await setHidden(true);
    await page.clock.runFor(6_000);
    await expect.poll(() => shown(page)).toEqual(["Saved"]);
    await setHidden(false);
    await page.clock.runFor(4_100);
    await expect.poll(() => shown(page)).toEqual([]);
  });
});
