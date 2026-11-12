import { expect, test } from "./support/test";
import {
  ADMIN_ROUTES,
  CUSTOMER_ROUTES,
  type PortalRoute,
  SHOP_ROUTES,
} from "../../src/features/portal/routes";
import type { Page } from "@playwright/test";

/**
 * P0-12 step D (production build): a page for every route-table entry, the designed 403 / not-found /
 * error pages, and real status codes. Shells, role switcher, cache headers and the authz matrix: step E.
 */
const FORBIDDEN = "You don't have access to this page";
const NOT_FOUND = "We can't find that page";

async function expectPages(page: Page, routes: readonly PortalRoute[]): Promise<void> {
  for (const route of routes) {
    const res = await page.goto(route.path);
    expect(res?.status(), route.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), route.path).toHaveText(
      route.path === "/admin/system" ? "System" : route.label,
    );
    await expect(page.locator("main"), route.path).toHaveCount(1);
    await expect(page.locator(`[data-portal="${route.portal}"]`), route.path).toBeVisible();
  }
}

test.describe("[P0-12] portal pages", () => {
  test("a shop owner can open every shop route and sees its title", async ({ page, signInAs }) => {
    await signInAs("owner");
    await expectPages(page, SHOP_ROUTES);
  });

  test("the admin owner can open every admin route and sees its title", async ({
    page,
    signInAs,
  }) => {
    await signInAs("admin_owner");
    await expectPages(page, ADMIN_ROUTES);
  });

  test("a customer can open every customer route; a visitor only the public ones", async ({
    page,
    signInAs,
    request,
  }) => {
    for (const route of CUSTOMER_ROUTES) {
      const res = await request.get(route.path, { maxRedirects: 0 });
      expect(res.status(), route.path).toBe(route.access === "public" ? 200 : 307);
    }
    await signInAs("customer");
    await expectPages(page, CUSTOMER_ROUTES);
  });

  test("COMPLIANCE §1: the Feedback and Offers placeholders carry no call to action", async ({
    page,
    signInAs,
  }) => {
    await signInAs("owner");
    for (const path of ["/dashboard/feedback", "/dashboard/offers"]) {
      await page.goto(path);
      await expect(page.locator("main a, main button"), path).toHaveCount(0);
      await expect(page.locator("main"), path).not.toContainText(/review|google|star/i);
    }
  });

  test("shop staff opening an owner-only page get a real 403 with no shell", async ({
    page,
    signInAs,
  }) => {
    await signInAs("staff");
    for (const path of ["/dashboard/settings", "/dashboard/staff"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
      await expect(page.getByRole("heading", { level: 1, name: FORBIDDEN })).toBeVisible();
      await expect(page.locator("[data-portal]")).toHaveCount(0);
    }
  });

  test("the 403 page names no role and links to the user's own portal", async ({
    page,
    signInAs,
    shoot,
  }) => {
    await signInAs("customer");
    const res = await page.goto("/admin/team");
    expect(res?.status()).toBe(403);
    const main = page.locator('main[data-page="forbidden"]');
    await expect(main).toBeVisible();
    await expect(main).not.toContainText(/owner|staff|admin|support|moderator|finance/i);
    await expect(main.getByRole("link", { name: "Go to my home page" })).toHaveAttribute(
      "href",
      "/wallet",
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await shoot(`forbidden-${width}`);
    }
    await main.getByRole("link", { name: "Go to my home page" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Wallet" })).toBeVisible();
  });

  test("an unknown path inside a portal is a real 404 inside that portal's shell", async ({
    page,
    signInAs,
    shoot,
  }) => {
    for (const [role, path, portal, back] of [
      ["staff", "/dashboard/nope", "shop", "/dashboard"],
      ["staff", "/dashboard/requests/nope/deeper", "shop", "/dashboard"],
      ["admin_support", "/admin/nope", "admin", "/admin"],
      ["customer", "/wallet/nope", "customer", "/wallet"],
    ] as const) {
      await page.context().clearCookies();
      await signInAs(role);
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.locator(`[data-portal="${portal}"]`), path).toBeVisible();
      await expect(page.locator("main"), path).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND }), path).toBeVisible();
      await expect(page.locator('[data-page="not-found"] a'), path).toHaveAttribute("href", back);
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await shoot(`not-found-in-shell-${width}`);
    }
  });

  test("an unknown path is gated before it is a 404", async ({ page, signInAs, request }) => {
    // Signed out: sign in first (the path is never echoed into returnTo).
    for (const [path, to] of [
      ["/dashboard/nope", "/staff/sign-in?returnTo=%2Fdashboard"],
      ["/admin/nope", "/staff/sign-in?returnTo=%2Fadmin"],
      ["/wallet/nope", "/sign-in?returnTo=%2Fwallet"],
    ] as const) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toBe(to);
    }
    // The wrong role: 403, not 404.
    await signInAs("customer");
    for (const path of ["/dashboard/nope", "/admin/nope"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
    }
    // The test-only error path does not exist for someone the gate refuses.
    expect((await page.goto("/dashboard/test-error"))?.status()).toBe(403);
  });

  test("a URL that matches no route is a real 404 with the designed page", async ({
    page,
    shoot,
  }) => {
    const res = await page.goto("/no-such-page");
    expect(res?.status()).toBe(404);
    const main = page.locator('main[data-page="not-found"]');
    await expect(main.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
    await expect(main.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(page).toHaveTitle("Page not found · Moz Rewards");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await shoot(`not-found-root-${width}`);
    }
  });
});

test.describe("[P0-12] portal error pages (C-04)", () => {
  // The forced error is a deliberate 500: the browser logs it and the response is a 5xx.
  test.use({ guardAllow: [/^(console|pageerror|http5xx): /] });

  test("a page error shows the designed error page in the shell, never the error's text", async ({
    page,
    signInAs,
    shoot,
  }) => {
    for (const [role, path, portal] of [
      ["staff", "/dashboard/test-error", "shop"],
      ["admin_owner", "/admin/test-error", "admin"],
      ["customer", "/wallet/test-error", "customer"],
    ] as const) {
      await page.context().clearCookies();
      await signInAs(role);
      const res = await page.goto(path);
      expect(await res?.text(), path).not.toContain("internal-detail-must-not-show");
      const error = page.locator('[data-page="error"]');
      await expect(error.getByRole("heading", { level: 1 }), path).toHaveText(
        "Something went wrong",
      );
      await expect(page.locator(`[data-portal="${portal}"]`), path).toBeVisible();
      await expect(page.locator("[data-portal-nav]").filter({ visible: true }), path).toHaveCount(
        1,
      );
      await expect(page.locator("body"), path).not.toContainText("internal-detail-must-not-show");
      await expect(page.locator("body"), path).not.toContainText("Forced portal error");
      await expect(error.locator("[data-error-digest]"), path).toHaveText(/^\w+$/);
      await expect(error.getByRole("button", { name: "Try again" }), path).toBeEnabled();
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await shoot(`error-in-shell-${width}`);
    }
  });
});
