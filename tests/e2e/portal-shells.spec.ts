import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-12 step E: the portal shells of DESIGN §5 (production build). Desktop projects check the rail and the
 * sidebar; phone projects the bottom navs, the raised Scan button, "More" and the clearance of fixed UI.
 */
const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1280) < 768;

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
