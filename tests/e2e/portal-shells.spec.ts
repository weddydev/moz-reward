import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-12 step E: the portal shells of DESIGN §5 (production build). Desktop projects check the rail and the
 * sidebar; phone projects the bottom navs, the raised Scan button, "More" and the clearance of fixed UI.
 */
const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 768;

/** The element's box once it has stopped moving (enter animations finished). */
async function settledBox(page: Page, locator: ReturnType<Page["locator"]>) {
  let last = await locator.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const next = await locator.boundingBox();
    if (next && last && Math.abs(next.y - last.y) < 0.5) return next;
    last = next;
  }
  return last;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: false });
}

test.describe("[P0-12] portal shells", () => {
  test("customer: rail on desktop, bottom nav with a raised Scan on phones", async ({
    page,
    signInAs,
  }) => {
    await signInAs("customer");
    await page.goto("/wallet");
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
    if (isPhone(page)) {
      const bar = page.locator('[data-portal-nav="bottom"]');
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("link")).toHaveText([/Wallet/, /Offers/, /Scan/, /Market/, /Me/]);
      await expect(bar.locator("[data-raised]")).toHaveCSS("width", "56px");
      await expect(bar.getByRole("link", { name: "Wallet" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Header: notifications for a signed-in customer; a customer-only account has nothing to switch to.
      await expect(page.getByRole("link", { name: "Notifications" })).toBeVisible();
      await expect(page.locator("[data-portal-switcher]")).toHaveCount(0);
    } else {
      const rail = page.locator('[data-portal-nav="side"]');
      await expect(rail).toBeVisible();
      await expect(rail.getByRole("link")).toHaveText([
        /Moz Rewards/,
        /Wallet/,
        /Offers/,
        /Market/,
        /Notifications/,
        /Me/,
      ]);
      // Collapsed: the rail takes 72px of the layout and the page starts beside it.
      const main = await page.locator("main").boundingBox();
      expect(main?.x).toBe(72);
    }
    await shot(page, "customer-wallet");
  });

  test("a visitor on a public page gets Sign in instead of account actions", async ({ page }) => {
    await page.goto("/offers");
    await expect(page.getByRole("heading", { level: 1, name: "Offers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).filter({ visible: true })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole("link", { name: "Notifications" }).filter({ visible: true }),
    ).toHaveCount(isPhone(page) ? 0 : 1);
  });

  test("shop staff: sidebar with shop card and plan state, or bottom nav with More", async ({
    page,
    signInAs,
  }) => {
    await signInAs("staff");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    if (isPhone(page)) {
      const bar = page.locator('[data-portal-nav="bottom"]');
      await expect(bar.getByRole("link")).toHaveText([/Home/, /Requests/, /Scan/, /Customers/]);
      await bar.getByRole("button", { name: "More" }).click();
      const sheet = page.getByRole("dialog", { name: "More" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Suggestions" })).toBeVisible();
      // Owner-only pages are not offered to staff; the role switcher reaches the customer app.
      await expect(sheet.getByRole("link", { name: "Staff" })).toHaveCount(0);
      await expect(sheet.getByRole("link", { name: "Settings" })).toHaveCount(0);
      await expect(sheet.getByRole("link", { name: "Customer app" })).toBeVisible();
      await shot(page, "shop-more");
      await sheet.getByRole("link", { name: "Feedback" }).click();
      await expect(page).toHaveURL(/\/dashboard\/feedback$/);
      await expect(sheet).toBeHidden();
      await expect(bar.getByRole("button", { name: "More" })).toHaveClass(/text-ink(?!-)/);
    } else {
      const side = page.locator('[data-portal-nav="side"]');
      await expect(side.locator("[data-shop-switcher]")).toBeVisible();
      await expect(side.locator("[data-plan-status]")).toBeVisible();
      // Staff see the plan state but get no link to Settings (owner only).
      await expect(side.locator("a[data-plan-status]")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Scan member QR" })).toBeVisible();
      await side.getByRole("button", { name: "Switch portal" }).click();
      await expect(page.getByRole("link", { name: "Customer app" })).toBeVisible();
      await shot(page, "shop-desktop");
    }
  });

  test("shop owner: plan footer links to Settings on desktop", async ({ page, signInAs }) => {
    test.skip(isPhone(page), "desktop sidebar");
    await signInAs("owner");
    await page.goto("/dashboard");
    await expect(page.locator('[data-portal-nav="side"] a[data-plan-status]')).toHaveAttribute(
      "href",
      "/dashboard/settings",
    );
  });

  test("admin: sidebar with every page the role may open; phones get the admin bottom nav", async ({
    page,
    signInAs,
  }) => {
    await signInAs("admin_moderator");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    if (isPhone(page)) {
      const bar = page.locator('[data-portal-nav="bottom"]');
      // A moderator may not open Applications or Shops: the bar shows only what the role may open.
      await expect(bar.getByRole("link")).toHaveText([/Overview/, /Moderate/]);
      await expect(bar.getByRole("button", { name: "More" })).toBeVisible();
    } else {
      const side = page.locator('[data-portal-nav="side"]');
      await expect(side.getByRole("link")).toHaveText([
        /Overview/,
        /Moderation/,
        /Fraud monitor/,
        /Content settings/,
      ]);
      await expect(side).toContainText("Admin · Moderator");
    }
    await shot(page, "admin-overview");
  });
});

test.describe("[P0-12] portal shells at 320px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const [role, path] of [
    ["customer", "/wallet"],
    ["owner", "/dashboard"],
    ["admin_owner", "/admin"],
  ] as const) {
    test(`${role}: no sideways scroll, every bottom-nav label readable`, async ({
      page,
      signInAs,
    }) => {
      await signInAs(role);
      await page.goto(path);
      await expect(page.locator('[data-portal-nav="bottom"]')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      for (const label of await page
        .locator(
          '[data-portal-nav="bottom"] li span.truncate, [data-portal-nav="bottom"] li button span:last-child',
        )
        .all()) {
        // A truncated label would be cut with an ellipsis: its content fits its box.
        expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await shot(page, `${role}-320`);
    });
  }
});

test.describe("[P0-12] portal shells, consent undecided", () => {
  // The cookie notice shows until a choice is stored.
  test.use({ analyticsConsent: null });

  test("phones: nothing hides under the bottom nav; the cookie notice and toasts clear it", async ({
    page,
    signInAs,
  }) => {
    test.skip(!isPhone(page), "phone layout");
    await signInAs("customer");
    await page.goto("/wallet");
    const bar = page.locator('[data-portal-nav="bottom"]');
    const notice = page.getByRole("region", { name: "Cookies" });
    await expect(notice).toBeVisible();
    const barBox = await bar.boundingBox();
    const raised = await bar.locator("[data-raised]").boundingBox();
    const noticeBox = await notice.boundingBox();
    if (!barBox || !raised || !noticeBox) throw new Error("no boxes");
    // The raised button rises above the bar; the notice sits above both.
    expect(raised.y).toBeLessThan(barBox.y);
    expect(noticeBox.y + noticeBox.height).toBeLessThanOrEqual(raised.y);
    await shot(page, "customer-cookie-notice");
    await notice.getByRole("button", { name: "No thanks" }).click();
    // Scrolled to the end, the last of the page content ends above the raised button.
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const content = await page.locator("[data-route-content]").boundingBox();
    if (!content) throw new Error("no content box");
    expect(content.y + content.height).toBeLessThanOrEqual(raised.y + 1);
  });
});

test.describe("[P0-12] shop switcher, toasts across navigation, per-item deny", () => {
  test("staff of two shops switch shop: the dashboard reloads on the chosen shop", async ({
    page,
    signInAs,
  }) => {
    await signInAs("staff", { extraShops: 1 });
    await page.goto("/dashboard");
    const current = async (): Promise<string> =>
      isPhone(page)
        ? ((await page.locator("[data-active-shop]").textContent()) ?? "")
        : ((await page.locator("[data-shop-switcher] button").first().textContent()) ?? "");
    const before = await current();
    if (isPhone(page)) {
      await page
        .locator('[data-portal-nav="bottom"]')
        .getByRole("button", { name: "More" })
        .click();
      const list = page
        .getByRole("dialog", { name: "More" })
        .getByRole("list", { name: "Your shops" });
      await list.locator("button:not([aria-current])").click();
    } else {
      await page
        .locator("[data-shop-switcher]")
        .getByRole("button", { name: /Switch shop/ })
        .click();
      await page
        .getByRole("list", { name: "Your shops" })
        .locator("button:not([aria-current])")
        .click();
    }
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect.poll(current).not.toBe(before);
  });

  test("a toast shown before a navigation stays at the bottom of the screen after it", async ({
    page,
    signInAs,
  }) => {
    test.skip(isPhone(page), "desktop: the shop card popover; phones use the same Toaster");
    await signInAs("staff", { extraShops: 1 });
    await page.goto("/dashboard");
    const openSwitcher = () =>
      page
        .locator("[data-shop-switcher]")
        .getByRole("button", { name: /Switch shop/ })
        .click();
    const other = () =>
      page.getByRole("list", { name: "Your shops" }).locator("button:not([aria-current])");
    // One real switch, to learn the action request…
    const sent = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
    await openSwitcher();
    await other().click();
    const req = await sent;
    await expect(page.locator("[data-shop-switcher]")).toContainText("Second Shop 1");
    // A successful switch closes the switcher.
    await expect(page.getByRole("dialog", { name: "Switch shop" })).toHaveCount(0);
    // …then use up the action's rate limit (30 a minute per user) the way a script would.
    const api = page.context().request;
    for (let i = 0; i < 30; i++) {
      await api.post(req.url(), {
        headers: {
          "next-action": req.headers()["next-action"] ?? "",
          "content-type": "text/plain;charset=UTF-8",
          accept: "text/x-component",
        },
        data: req.postData() ?? "",
      });
    }
    // A later visit: the next switch from the page is refused, and the switcher says so in a toast.
    await page.reload();
    await openSwitcher();
    await other().click();
    const toastEl = page.locator(".toast", { hasText: /too many/i });
    await expect(toastEl).toBeVisible();
    const before = await settledBox(page, toastEl);
    // The switcher stays open after an error (to try again); focus stays in it, so Esc closes it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Switch shop" })).toHaveCount(0);
    await page
      .locator('[data-portal-nav="side"]')
      .getByRole("link", { name: "Requests" })
      .click({ timeout: 5000 });
    await expect(page).toHaveURL(/\/dashboard\/requests$/);
    await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
    await expect(toastEl).toBeVisible();
    const after = await settledBox(page, toastEl);
    const vh = page.viewportSize()?.height ?? 0;
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? -100))).toBeLessThanOrEqual(1);
    expect((after?.y ?? 0) + (after?.height ?? 0)).toBeGreaterThan(vh - 120);
  });

  test("per-item deny on a client navigation: no page content in the answer", async ({
    page,
    signInAs,
  }) => {
    await signInAs("staff");
    await page.goto("/dashboard");
    // Capture the headers of a real client navigation (RSC request with the router state)…
    const nav = page.waitForRequest(
      (r) =>
        r.url().includes("/dashboard/requests") &&
        r.headers()["rsc"] === "1" &&
        !r.headers()["next-router-prefetch"],
    );
    const link = isPhone(page)
      ? page.locator('[data-portal-nav="bottom"]').getByRole("link", { name: "Requests" })
      : page.locator('[data-portal-nav="side"]').getByRole("link", { name: "Requests" });
    await link.click();
    const headers = (await nav).headers();
    // …and replay it for an owner-only page.
    const res = await page.context().request.get("/dashboard/settings?_rsc=e2e", {
      headers: {
        rsc: "1",
        "next-router-state-tree": headers["next-router-state-tree"] ?? "",
        ...(headers["next-url"] ? { "next-url": headers["next-url"] } : {}),
      },
    });
    expect([200, 403]).toContain(res.status());
    const body = await res.text();
    // A full load is a real 403 (the layout gate); a client navigation re-renders only the page segment, under
    // its loading boundary: 200 carrying the 403 signal and none of the page (DECISIONS 13 Nov 2026).
    expect(body).toContain("NEXT_HTTP_ERROR_FALLBACK;403");
    expect(body).not.toContain("Your shop profile, opening hours and plan will show here.");
  });
});

/**
 * Visual snapshots of each shell (mobile 390 and desktop 1440). Tagged @visual: left out of ordinary runs and
 * CI, included when VISUAL=1 (`pnpm gate:phase`, `pnpm e2e:visual`). Per-OS baselines beside this spec.
 * Shop names come from the test factory, so the shop card text is masked (it differs per run).
 */
test.describe("[P0-12] portal shell visual snapshots", { tag: "@visual" }, () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "one browser holds the baseline");
  });

  for (const [role, path] of [
    ["customer", "/wallet"],
    ["owner", "/dashboard"],
    ["admin_owner", "/admin"],
  ] as const) {
    for (const width of [390, 1440] as const) {
      test(`${role} shell looks as approved at ${String(width)}px`, async ({ page, signInAs }) => {
        await page.setViewportSize({ width, height: 844 });
        await signInAs(role);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`shell-${role}-${String(width)}.png`, {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.002,
          mask: [page.locator("[data-shop-switcher]"), page.locator("[data-active-shop]")],
        });
      });
    }
  }
});
