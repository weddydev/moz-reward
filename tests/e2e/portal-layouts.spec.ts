import { expect, test } from "./support/test";

/**
 * P0-12 step C: the three group layouts gate before they render a shell (production build). The full
 * per-role landing, authz matrix, cache headers and visual snapshots come with steps D and E.
 */
test.describe("[P0-12] portal layouts", () => {
  test("signed out: each gated portal root is a real 307 to its sign-in, with returnTo", async ({
    request,
  }) => {
    for (const [path, to] of [
      ["/dashboard", "/staff/sign-in?returnTo=%2Fdashboard"],
      ["/admin/system", "/staff/sign-in?returnTo=%2Fadmin%2Fsystem"],
      ["/wallet", "/sign-in?returnTo=%2Fwallet"],
      ["/me", "/sign-in?returnTo=%2Fme"],
    ] as const) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(307);
      expect(res.headers().location, path).toBe(to);
      expect(await res.text(), path).not.toContain("data-portal");
    }
  });

  test("a customer opening the shop or admin portal gets a real 403 with no shell", async ({
    page,
    signInAs,
  }) => {
    await signInAs("customer");
    for (const path of ["/dashboard", "/admin/system"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
      await expect(
        page.getByRole("heading", { name: "You don't have access to this page" }),
      ).toBeVisible();
      await expect(page.locator("[data-portal]")).toHaveCount(0);
      await expect(page.locator("[data-portal-nav]")).toHaveCount(0);
    }
  });

  test("shop staff land in the shop shell: one main, role-filtered nav, active item", async ({
    page,
    signInAs,
  }) => {
    await signInAs("staff");
    const res = await page.goto("/dashboard");
    expect(res?.status()).toBe(200);
    await expect(page.locator('[data-portal="shop"]')).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    const nav = page.locator("[data-portal-nav]").filter({ visible: true });
    await expect(nav).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(/Overview|Home/);
    // Owner-only items are not offered to staff (a courtesy; the page gate is the control).
    await expect(page.locator('[data-portal-nav] a[href="/dashboard/staff"]')).toHaveCount(0);
    await expect(page.locator('[data-portal-nav] a[href="/dashboard/settings"]')).toHaveCount(0);
  });

  test("the fixed bottom nav and the toast region sit outside the sliding content", async ({
    page,
    signInAs,
  }) => {
    await signInAs("customer");
    await page.goto("/wallet");
    await expect(page.locator('[data-portal="customer"]')).toBeVisible();
    await expect(page.locator("[data-route-content] [data-portal-nav]")).toHaveCount(0);
    await expect(page.locator('[data-route-content] [role="status"]')).toHaveCount(0);
    await expect(page.locator('[data-route-content] [role="alert"]')).toHaveCount(0);
    await expect(page.locator('[data-portal-nav="bottom"]')).toHaveCSS("position", "fixed");
  });

  test("the admin owner sees System inside the admin shell", async ({ page, signInAs }) => {
    await signInAs("admin_owner");
    await page.goto("/admin/system");
    await expect(page.locator('[data-portal="admin"]')).toBeVisible();
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible();
  });
});
