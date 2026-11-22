import { type Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * PD-04 (DESIGN §6.3, §7.4): Molten buttons, the heart toggle and the toast on the production build — the
 * behaviour the parity harness can't see (keyboard, touch, double clicks, long labels, reduced motion, targets,
 * focus) and the screens for inspection. Pixel and motion parity: tests/parity.
 */
async function open(page: Page, path = "/dev/molten"): Promise<void> {
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
}

const molten = (page: Page) => page.locator('[data-parity="molten-button"]');
const heart = (page: Page) => page.getByRole("button", { name: "Save offer" });

test("[PD-04] keyboard: Enter on the molten button ripples from the centre, rolls the label and toasts", async ({
  page,
}) => {
  await open(page);
  const btn = molten(page);
  await btn.focus();
  // The Molten focus ring is visible on keyboard focus (PD-03 reference ring).
  await expect(btn).toHaveCSS("outline-style", "solid");
  // Watch first (awaited), press second, then read what the watcher saw.
  await btn.evaluate((el) => {
    const w = window as unknown as {
      __ripple?: { left: number; top: number; w: number; h: number; d: number };
    };
    new MutationObserver((records, obs) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.classList.contains("m-ripple")) {
            obs.disconnect();
            const b = el.getBoundingClientRect();
            w.__ripple = {
              left: parseFloat(n.style.left),
              top: parseFloat(n.style.top),
              w: b.width,
              h: b.height,
              d: parseFloat(n.style.width),
            };
          }
    }).observe(el, { childList: true });
  });
  await page.keyboard.press("Enter");
  const handle = await page.waitForFunction(
    () => (window as unknown as { __ripple?: unknown }).__ripple ?? null,
  );
  const r = (await handle.jsonValue()) as {
    left: number;
    top: number;
    w: number;
    h: number;
    d: number;
  };
  // Centred: the ripple's centre is the button's centre.
  expect(Math.abs(r.left + r.d / 2 - r.w / 2)).toBeLessThan(1);
  expect(Math.abs(r.top + r.d / 2 - r.h / 2)).toBeLessThan(1);
  await expect(page.getByRole("button", { name: "+80 gold added" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Notifications" })
      .getByText("80 gold added at Brew & Bloom Café"),
  ).toBeVisible();
  // Back to the idle label after 1.7 s.
  await expect(page.getByRole("button", { name: "Collect gold" })).toBeVisible({ timeout: 4_000 });
});

test("[PD-04] double click: the label roll restarts cleanly and settles once (one celebration: unit test)", async ({
  page,
}) => {
  await open(page);
  await molten(page).dblclick();
  await expect(molten(page)).toHaveClass(/(^|\s)ok(\s|$)/);
  await expect(page.getByRole("button", { name: "+80 gold added" })).toBeVisible();
  await expect(molten(page)).not.toHaveClass(/(^|\s)ok(\s|$)/, { timeout: 4_000 });
  await expect(page.getByRole("button", { name: "Collect gold" })).toBeVisible();
});

test("[PD-04] touch: no magnetic lean, no sticky hover light; the heart toggles with aria-pressed", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "pixel7" && test.info().project.name !== "iphone14",
    "touch devices",
  );
  await open(page);
  await molten(page).tap();
  expect(
    await molten(page).evaluate((el) => (el as HTMLElement).style.getPropertyValue("--tx")),
  ).toBe("");
  const glow = await molten(page).evaluate((el) => getComputedStyle(el, "::after").opacity);
  expect(glow).toBe("0");
  await heart(page).tap();
  await expect(heart(page)).toHaveAttribute("aria-pressed", "true");
  await heart(page).tap();
  await expect(heart(page)).toHaveAttribute("aria-pressed", "false");
});

test("[PD-04] fine pointer: the molten button leans toward the cursor within ±8 / ±6 px and settles on leave", async ({
  page,
}) => {
  test.skip(
    test.info().project.name !== "desktop1440" && test.info().project.name !== "chromium",
    "fine pointer",
  );
  await open(page);
  await molten(page).scrollIntoViewIfNeeded();
  // Events at computed points, through the production listener: a real cursor races the lean itself (the button
  // moves up to 8 px under it, the tile lifts 4 px on hover), which made hit-testing flaky (22 Nov).
  const lean = await molten(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = (x: number, y: number) => ({
      clientX: r.left + x,
      clientY: r.top + y,
      pointerType: "mouse",
      bubbles: true,
    });
    el.dispatchEvent(new PointerEvent("pointermove", at(r.width - 14, r.height / 2 + 8)));
    const moved = [el.style.getPropertyValue("--tx"), el.style.getPropertyValue("--ty")];
    el.dispatchEvent(new PointerEvent("pointermove", at(r.width + 400, r.height + 400)));
    const capped = [el.style.getPropertyValue("--tx"), el.style.getPropertyValue("--ty")];
    el.dispatchEvent(new PointerEvent("pointerleave", at(-10, -10)));
    const left = [el.style.getPropertyValue("--tx"), el.style.getPropertyValue("--ty")];
    return { w: r.width, h: r.height, moved, capped, left };
  });
  const clamp = (lo: number, hi: number, v: number): number => Math.max(lo, Math.min(hi, v));
  expect(lean.moved).toEqual([
    `${clamp(-8, 8, (lean.w - 14 - lean.w / 2) * 0.1).toFixed(1)}px`,
    `${clamp(-6, 6, 8 * 0.25).toFixed(1)}px`,
  ]);
  expect(lean.capped).toEqual(["8.0px", "6.0px"]); // never more than ±8 / ±6
  expect(lean.left).toEqual(["0px", "0px"]); // settles on leave
});

test("[PD-04] targets ≥ 44 px, long labels never overflow, loading keeps the width; axe clean", async ({
  page,
}) => {
  await open(page, "/dev/ui");
  const buttons = page.locator(".m-btn, .m-ico-btn").filter({ visible: true });
  await expect(buttons.first()).toBeVisible();
  const count = await buttons.count();
  expect(count).toBeGreaterThan(5);
  for (let i = 0; i < count; i++) {
    const b = await buttons.nth(i).boundingBox();
    expect(b?.height ?? 0, `button ${String(i)}`).toBeGreaterThanOrEqual(44);
  }
  const long = page.getByRole("button", { name: /Request points from Brew & Bloom Café/ });
  await long.scrollIntoViewIfNeeded();
  // The label box inside the button, the button inside the viewport (scrollWidth would count the molten fill's
  // 300%-wide flowing layer, which the button clips on purpose).
  const fits = await long.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const t = (el.querySelector(".m-txt") ?? el).getBoundingClientRect();
    return t.left >= b.left && t.right <= b.right && b.left >= 0 && b.right <= window.innerWidth;
  });
  expect(fits).toBe(true);
  // Loading keeps the label in layout, hidden, so the width stays (the gallery's loading states).
  const loading = page.locator('.m-btn[aria-busy="true"]');
  await expect(loading.first()).toBeVisible();
  // Every variant hides its label while busy (the ghost's sits in its underline wrapper).
  for (const label of await loading.locator(".m-txt, .m-lbl, .u").all())
    await expect(label).toHaveCSS("opacity", "0");
});

test("[PD-04] reduced motion: the press still works, the heart just fills, the toast only fades", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  await heart(page).click();
  await expect(heart(page)).toHaveAttribute("aria-pressed", "true");
  expect(await heart(page).locator(".m-dot").count()).toBe(0);
  const toast = page.locator("li.m-toast").first();
  await expect(toast).toBeVisible();
  const moves = await toast.evaluate((el) =>
    el.getAnimations().some((a) => {
      const kf = (a.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
      return kf.some((k) => typeof k.transform === "string" && k.transform !== "none");
    }),
  );
  expect(moves).toBe(false);
});

test("[PD-04] /dev/molten and /dev/ui at 320, 390 and 1440: no horizontal scroll (screens for inspection)", async ({
  page,
  shoot,
}) => {
  // Both engines (design review M7): Chromium in the gate, WebKit on CI and the Mac.
  test.skip(
    !["chromium", "webkit"].includes(test.info().project.name),
    "inspection screens: one project per engine",
  );
  for (const path of ["/dev/molten", "/dev/ui"]) {
    await open(page, path);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${String(width)}`).toBeLessThanOrEqual(0);
      if (path === "/dev/molten") {
        await page.locator('[data-parity="tile"]').scrollIntoViewIfNeeded();
        await shoot(`molten-buttons-${String(width)}`, { fullPage: false });
        // The focus ring on the molten button, by keyboard.
        await molten(page).focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(molten(page)).toBeFocused();
        await shoot(`molten-focus-${String(width)}`, { fullPage: false });
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
        });
      } else {
        await page.getByText("Actions", { exact: true }).first().scrollIntoViewIfNeeded();
        await shoot(`ui-buttons-${String(width)}`, { fullPage: false });
      }
    }
  }
});
