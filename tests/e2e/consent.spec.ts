import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-13 AC5 (COMPLIANCE §3): the analytics script is absent until consent; "No thanks" is as easy as "Allow" and
 * is remembered; once allowed, Umami loads same-origin and never sends query strings (C-26).
 */
test.use({ analyticsConsent: null });

const notice = (page: Page) => page.getByRole("region", { name: "Cookies" });
const analyticsScript = (page: Page) => page.locator("script[data-moz-analytics]");

async function stubUmami(page: Page): Promise<string[]> {
  const hits: string[] = [];
  await page.route("**/u/**", async (route) => {
    hits.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "/* umami stub */" });
  });
  return hits;
}

test("[P0-13] AC5: no analytics before consent; 'No thanks' is remembered", async ({
  page,
  shoot,
}) => {
  const hits = await stubUmami(page);
  await page.goto("/sign-in?token=never-sent");
  await expect(notice(page)).toBeVisible();
  await expect(analyticsScript(page)).toHaveCount(0);
  await shoot("cookie-notice");
  if (test.info().project.name === "chromium") {
    await page.setViewportSize({ width: 320, height: 720 });
    await shoot("cookie-notice-320");
  }
  await notice(page).getByRole("button", { name: "No thanks" }).click();
  await expect(notice(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeEnabled();
  await expect(notice(page)).toHaveCount(0);
  await expect(analyticsScript(page)).toHaveCount(0);
  expect(hits).toEqual([]);
});

test("[P0-13] AC5: 'Allow analytics' loads Umami same-origin, without query strings", async ({
  page,
}) => {
  const hits = await stubUmami(page);
  await page.goto("/sign-in");
  await expect(analyticsScript(page)).toHaveCount(0);
  await notice(page).getByRole("button", { name: "Allow analytics" }).click();
  await expect(notice(page)).toHaveCount(0);
  const script = analyticsScript(page);
  await expect(script).toHaveAttribute("src", "/u/script.js");
  await expect(script).toHaveAttribute("data-exclude-search", "true");
  await expect(script).toHaveAttribute("data-exclude-hash", "true");
  await expect(script).toHaveAttribute("data-host-url", "/u");
  await expect.poll(() => hits).toContain("/u/script.js");
  // Next visit: loaded straight away, no notice.
  await page.reload();
  await expect(notice(page)).toHaveCount(0);
  await expect(analyticsScript(page)).toHaveCount(1);
});
