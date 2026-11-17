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

test("[P1-02] first visit: the notice text is in the server HTML, its buttons only work once hydrated", async ({
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  // Without JavaScript: the text paints with the page (it is the landing's LCP on a first visit), while the
  // buttons stay hidden and unfocusable, so a tap before React owns them can never be lost (P0-13).
  const context = await browser.newContext({
    javaScriptEnabled: false,
    ...(baseURL ? { baseURL } : {}),
    ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await expect(notice(page)).toBeVisible();
  await expect(notice(page).getByText("We use essential cookies")).toBeVisible();
  await expect(notice(page).getByRole("button")).toHaveCount(0);
  const reserved = await notice(page).locator("[data-consent-actions]").boundingBox();
  expect(reserved?.height ?? 0).toBeGreaterThan(30);
  await context.close();

  // With a stored choice the server renders no notice at all (no flash for returning visitors).
  const decided = await browser.newContext({
    javaScriptEnabled: false,
    ...(baseURL ? { baseURL } : {}),
    ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}),
  });
  await decided.addCookies([
    { name: "moz_consent", value: "analytics-v1-denied", url: baseURL ?? "", sameSite: "Lax" },
  ]);
  const page2 = await decided.newPage();
  await page2.goto("/sign-in");
  await expect(notice(page2)).toHaveCount(0);
  await decided.close();
});

test("[P1-02] first visit with JavaScript: hydrated buttons appear in the reserved space without a shift", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const before = await notice(page).boundingBox();
  await expect(notice(page).getByRole("button", { name: "No thanks" })).toBeVisible();
  const after = await notice(page).boundingBox();
  expect(after?.y).toBe(before?.y);
  expect(after?.height).toBe(before?.height);
});
