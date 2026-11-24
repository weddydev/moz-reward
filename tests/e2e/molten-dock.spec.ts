import { expect, test } from "./support/test";
import { TIER_OVERRIDE_KEY } from "../../src/lib/motion/tier";
import type { Locator, Page } from "@playwright/test";

/**
 * PD-07: the floating dock (customer, shop and admin bottom navs) and the customer rail's liquid gold, on the
 * production build. Pixel and motion parity with the reference run in tests/parity (`dock` part); these check
 * the dock in the real app: placement, the current item, the pour across routes, clearance, the keyboard, the
 * idle loops and the rail.
 */
const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 768;
const dock = (page: Page): Locator => page.locator('[data-portal-nav="bottom"]');
const rail = (page: Page): Locator => page.locator('[data-portal-nav="side"]');

/** Waits until nothing inside `root` is animating (the pour, the droplet). Endless loops don't count. */
async function poured(root: Locator): Promise<void> {
  await expect
    .poll(() =>
      root.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter(
              (a) =>
                a.playState === "running" &&
                Number.isFinite(a.effect?.getComputedTiming().endTime ?? Number.POSITIVE_INFINITY),
            ).length,
      ),
    )
    .toBe(0);
}

/** The gold's resting box against an item's box (centres, along the run), in viewport pixels. */
async function goldOn(root: Locator, item: Locator, axis: "x" | "y"): Promise<number> {
  const blob = await root.locator(".m-blob").boundingBox();
  const box = await item.boundingBox();
  if (!blob || !box) throw new Error("no boxes");
  return axis === "x"
    ? blob.x + blob.width / 2 - (box.x + box.width / 2)
    : blob.y + blob.height / 2 - (box.y + box.height / 2);
}

test.describe("[PD-07] floating dock", () => {
  test("[PD-07] customer: a glass dock 12 px from the edges, Wallet current on the gold", async ({
    page,
    signInAs,
    shoot,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const bar = dock(page);
    await expect(bar).toBeVisible();
    const vp = page.viewportSize();
    const box = await bar.boundingBox();
    if (!vp || !box) throw new Error("no boxes");
    // Reference `.dock`: 12 px in, 14 px up (no home indicator in the emulator), 70 px tall, radius 26.
    expect(box.x).toBeCloseTo(12, 0);
    expect(vp.width - (box.x + box.width)).toBeCloseTo(12, 0);
    expect(vp.height - (box.y + box.height)).toBeCloseTo(14, 0);
    expect(box.height).toBeCloseTo(70, 0);
    await expect(bar).toHaveCSS("border-radius", "26px");
    await expect(bar).toHaveCSS("position", "fixed");
    const wallet = bar.getByRole("link", { name: "Wallet" });
    await expect(wallet).toHaveAttribute("aria-current", "page");
    await expect(bar.locator("[aria-current]")).toHaveCount(1);
    expect(Math.abs(await goldOn(bar, wallet, "x"))).toBeLessThanOrEqual(1);
    // The Scan coin rises 13 px above the dock and is named for screen readers.
    const scan = bar.getByRole("link", { name: "Scan" });
    const coin = await scan.boundingBox();
    expect(coin?.height).toBeCloseTo(62, 0);
    expect(box.y - (coin?.y ?? 0)).toBeCloseTo(13, 0);
    await shoot("dock-wallet");
  });

  test("[PD-07] customer: the gold pours to the new page; a second tap mid-pour retargets", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const bar = dock(page);
    await bar.getByRole("link", { name: "Offers" }).click();
    await expect(page).toHaveURL(/\/offers$/);
    const offers = bar.getByRole("link", { name: "Offers" });
    await expect(offers).toHaveAttribute("aria-current", "page");
    await poured(bar);
    expect(Math.abs(await goldOn(bar, offers, "x"))).toBeLessThanOrEqual(1);
    // Two routes in a row: the gold ends on the last one, never back on the first.
    await bar.getByRole("link", { name: "Market" }).click();
    await bar.getByRole("link", { name: "Me" }).click();
    await expect(page).toHaveURL(/\/me$/);
    const me = bar.getByRole("link", { name: "Me" });
    await expect(me).toHaveAttribute("aria-current", "page");
    await poured(bar);
    expect(Math.abs(await goldOn(bar, me, "x"))).toBeLessThanOrEqual(1);
  });

  test("[PD-07] customer: Scan opens the scan page; the gold drains while Scan is current", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const bar = dock(page);
    await bar.getByRole("link", { name: "Scan" }).click();
    await expect(page).toHaveURL(/\/scan$/);
    await expect(bar.getByRole("link", { name: "Scan" })).toHaveAttribute("aria-current", "page");
    await expect(bar).toHaveAttribute("data-empty", "");
    await expect(bar.locator(".m-goo")).toHaveCSS("opacity", "0");
    // A page with no dock item (Notifications, from the header) drains it too; the customer dock has no More.
    await page.goto("/notifications");
    await expect(dock(page)).toHaveAttribute("data-empty", "");
    await expect(dock(page).locator("[aria-current]")).toHaveCount(0);
  });

  test("[PD-07] nothing hides behind the dock: the page ends above the Scan coin", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/me");
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const content = await page.locator("[data-route-content]").boundingBox();
    const coin = await dock(page).getByRole("link", { name: "Scan" }).boundingBox();
    if (!content || !coin) throw new Error("no boxes");
    expect(content.y + content.height).toBeLessThanOrEqual(coin.y + 1);
  });

  test("[PD-07] a shorter viewport (the iOS toolbar showing) keeps the dock 14 px from the bottom", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const vp = page.viewportSize();
    if (!vp) throw new Error("no viewport");
    await page.setViewportSize({ width: vp.width, height: vp.height - 80 });
    const box = await dock(page).boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(vp.height - 80 - 14, 0);
  });

  test("[PD-07] the on-screen keyboard hides the dock while a field is being typed into", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    // Playwright opens no software keyboard: shrink the visual viewport the way one does.
    await page.addInitScript(() => {
      const vv = window.visualViewport;
      if (!vv) return;
      let shrink = 0;
      const height = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height");
      Object.defineProperty(vv, "height", {
        configurable: true,
        get: () => (height?.get?.call(vv) as number) - shrink,
      });
      Object.assign(window, {
        __keyboard: (px: number) => {
          shrink = px;
          vv.dispatchEvent(new Event("resize"));
        },
      });
    });
    // The shop's loyalty settings: the first page with fields that has a dock (below 1024px).
    await signInAs("owner");
    await page.goto("/dashboard/loyalty");
    const field = page.getByLabel("Main reward (when the ingot is full)");
    await expect(field).toBeVisible();
    const bar = dock(page);
    await expect(bar).toBeVisible();
    // The fieldset is disabled until hydration (C-20), and `focus()` on a disabled field is a silent no-op: on a
    // slow runner it focused nothing, so the "keyboard" opened over no field (CI 45136257889, KI-20).
    await expect(field).toBeEnabled();
    await field.focus();
    await expect(field).toBeFocused();
    await page.evaluate(() => {
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard(320);
    });
    await expect(bar).toHaveAttribute("data-keyboard", "");
    await expect(bar).toBeHidden();
    await page.evaluate(() => {
      (window as unknown as { __keyboard: (px: number) => void }).__keyboard(0);
    });
    await expect(bar).not.toHaveAttribute("data-keyboard", "");
    await expect(bar).toBeVisible();
  });

  test("[PD-07] the Scan coin's halo and radar loop; reduced motion lands them once", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const scan = dock(page).getByRole("link", { name: "Scan" });
    const loops = (pseudo: "::before" | "::after") =>
      scan.evaluate((el, p) => getComputedStyle(el, p).animationIterationCount, pseudo);
    expect(await loops("::before")).toBe("infinite");
    expect(await loops("::after")).toBe("infinite");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => loops("::before")).toBe("1");
    expect(await loops("::after")).toBe("1");
  });

  test("[PD-07] loops sleep where the dock isn't shown (desktop widths)", async ({
    page,
    signInAs,
  }) => {
    test.skip(isPhone(page), "the dock is hidden from 768px");
    await signInAs("customer");
    await page.goto("/wallet");
    await expect(dock(page)).toBeHidden();
    await expect(dock(page)).toHaveAttribute("data-paused");
  });

  test("[PD-07] shop: five items at 320 px, every label inside its own column", async ({
    page,
    signInAs,
    shoot,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await page.setViewportSize({ width: 320, height: 640 });
    await signInAs("owner");
    await page.goto("/dashboard");
    const bar = dock(page);
    const labels = await bar.locator("[data-nav-label]").all();
    expect(labels).toHaveLength(4); // Home, Requests, Customers, More (+ the label-less Scan coin)
    const barBox = await bar.boundingBox();
    const boxes = await Promise.all(labels.map((l) => l.boundingBox()));
    for (const [i, b] of boxes.entries()) {
      if (!b || !barBox) throw new Error("no boxes");
      expect(b.x).toBeGreaterThanOrEqual(barBox.x);
      expect(b.x + b.width).toBeLessThanOrEqual(barBox.x + barBox.width);
      const next = boxes[i + 1];
      if (next) expect(b.x + b.width).toBeLessThanOrEqual(next.x);
    }
    const home = bar.getByRole("link", { name: "Home" });
    await expect(home).toHaveAttribute("aria-current", "page");
    await shoot("dock-shop-320");
  });

  test("[PD-07] admin: no Scan coin; the gold sits on the current item", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "the dock is the phone navigation");
    await signInAs("admin_owner");
    await page.goto("/admin");
    const bar = dock(page);
    await expect(bar.locator(".m-scan")).toHaveCount(0);
    const overview = bar.getByRole("link", { name: "Overview" });
    await expect(overview).toHaveAttribute("aria-current", "page");
    expect(Math.abs(await goldOn(bar, overview, "x"))).toBeLessThanOrEqual(1);
  });
});

test.describe("[PD-07] customer rail", () => {
  test("[PD-07] the current page sits on liquid gold that pours down to the next page", async ({
    page,
    signInAs,
    shoot,
  }) => {
    test.skip(isPhone(page), "the rail is the tablet and desktop navigation");
    await signInAs("customer");
    await page.goto("/wallet");
    const side = rail(page);
    const list = side.locator("ul").first();
    const wallet = side.getByRole("link", { name: "Wallet" });
    await expect(wallet).toHaveAttribute("aria-current", "page");
    expect(Math.abs(await goldOn(list, wallet, "y"))).toBeLessThanOrEqual(1);
    await shoot("rail-wallet");
    await side.getByRole("link", { name: "Market" }).click();
    await expect(page).toHaveURL(/\/market$/);
    const market = side.getByRole("link", { name: "Market" });
    await expect(market).toHaveAttribute("aria-current", "page");
    await poured(list);
    expect(Math.abs(await goldOn(list, market, "y"))).toBeLessThanOrEqual(1);
  });
});

test.describe("[PD-11] shop and admin sidebar", () => {
  test("[PD-11] glass, the current page on liquid gold that pours down to the next page", async ({
    page,
    signInAs,
    shoot,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 1024, "the sidebar is the desktop navigation");
    // A full-tier device whatever runs the test: CI's 4-core runners are lite, where the glass is dropped
    // (`.lite .m-side`; CI 45484442092).
    await page.addInitScript((key) => {
      window.sessionStorage.setItem(key, "full");
    }, TIER_OVERRIDE_KEY);
    await signInAs("owner");
    await page.goto("/dashboard");
    const side = rail(page);
    const list = side.locator("ul").first();
    await expect(side).toHaveCSS("backdrop-filter", /blur\(16px\)/);
    const overview = side.getByRole("link", { name: "Overview" });
    await expect(overview).toHaveAttribute("aria-current", "page");
    expect(Math.abs(await goldOn(list, overview, "y"))).toBeLessThanOrEqual(1);
    await shoot("side-nav-overview");
    await side.getByRole("link", { name: "Customers" }).click();
    await expect(page).toHaveURL(/\/dashboard\/customers$/);
    const customers = side.getByRole("link", { name: "Customers" });
    await expect(customers).toHaveAttribute("aria-current", "page");
    await poured(list);
    expect(Math.abs(await goldOn(list, customers, "y"))).toBeLessThanOrEqual(1);
  });
});
