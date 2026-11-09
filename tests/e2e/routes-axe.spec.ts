import { expect, test } from "./support/test";
import { ROUTES } from "./support/warm-up";

/**
 * Axe on every top-level page route (P0-14, TESTING §4 "axe on all routes"). Each test only opens the route
 * signed out; the shared guard then fails it on any console/network problem or serious/critical axe
 * violation of the page it lands on (redirects included). New routes are added to ROUTES in warm-up.ts.
 */
test.describe("[P0-14] every route is axe-clean signed out", () => {
  for (const route of ROUTES.filter((r) => !r.startsWith("/api/"))) {
    test(`axe-clean: ${route}`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status() ?? 0, `${route} answered`).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
    });
  }
});
