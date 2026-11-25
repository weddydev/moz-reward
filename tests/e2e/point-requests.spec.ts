import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test, testApiHeaders } from "./support/test";

// P1-11 on the production build: "Request points" on the member's shop page (Molten: sparks, label roll,
// toast), the pending state (live, kept across reloads), one request for a double tap, the offline queue (the
// same key sent when back online), the pending state going when the request expires (realtime), and leaving
// with a request open (C-68). Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-11).

const SHOP = "Brew & Bloom Café";
const SENT_TOAST = "Request sent. The shop will approve it shortly.";
const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

async function seedShop(
  request: APIRequestContext,
  userId: string,
  over: Record<string, unknown> = {},
): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: SHOP,
      details: true,
      programme: "sample",
      memberUserId: userId,
      member: { purchaseCount: 5, progressGold: 720 },
      ...over,
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

async function requestsOf(
  request: APIRequestContext,
  userId: string,
): Promise<Array<{ status: string }>> {
  const res = await request.post("/api/test/point-requests", {
    data: { userId },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { requests: Array<{ status: string }> }).requests;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P1-11] request points: a double tap makes one request; the pending state shows and survives a reload", async ({
  page,
  signInAs,
  shoot,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  await page.goto(`/shops/${shopId}`);

  const button = page.getByTestId("request-points");
  await expect(button).toHaveText(/Request points/);
  // Viewport shots: the button and the pending card sit under the mini vault, and full-page shots of this tall
  // page at 3× (iphone14, Linux WebKit) took the test past 30 s (CI 45640478708).
  await shoot("request-button-390", { fullPage: false });
  await button.dblclick();

  await expect(toasts(page).getByText(SENT_TOAST)).toBeVisible();
  const pending = page.getByTestId("request-pending");
  await expect(pending).toBeVisible();
  await expect(pending).toHaveAttribute("data-status", "pending");
  await expect(pending).toContainText("Request sent");
  await expect(page.getByTestId("request-pending-text")).toHaveText(
    new RegExp(`^Sent at \\d{2}:\\d{2}\\. Staff at ${SHOP} will approve it shortly\\.$`),
  );
  await expect(page.getByTestId("request-points")).toHaveCount(0);
  expect(await requestsOf(page.request, me.userId)).toEqual([
    expect.objectContaining({ status: "pending" }),
  ]);

  await page.reload();
  await expect(page.getByTestId("request-pending")).toBeVisible();
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    await shoot(`request-pending-${String(width)}`, { fullPage: false });
  }
});

test.describe("offline", () => {
  // Going offline is this test's own doing: Next's nav-link prefetches (`?_rsc=`) cut by the switch fail, and
  // WebKit reports each one (CI 45640478708, iphone14). Only those are allowed; one regex (a two-element array
  // in test.use() reads as a [value, options] tuple).
  test.use({
    guardAllow: [
      /^(requestfailed: GET \S+[?&]_rsc=\S+ |console: Failed to load resource: WebKit encountered an internal error$|console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED$)/,
    ],
  });

  test("[P1-11] offline: the tap is queued on the phone and sent with its key when back online", async ({
    page,
    context,
    signInAs,
    shoot,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const me = await signInAs("customer");
    const { shopId } = await seedShop(page.request, me.userId);
    await page.goto(`/shops/${shopId}`);
    await expect(page.getByTestId("request-points")).toBeVisible();
    // Fully loaded before the network is cut (KI-49: a late chunk or font cut by the switch fails on its own).
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(page.locator("html")).not.toHaveAttribute("data-monitoring", "loading");
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.getByTestId("request-points").click();
    await expect(page.getByTestId("request-queued")).toBeVisible();
    await shoot("request-queued-390", { fullPage: false });
    expect(await requestsOf(page.request, me.userId)).toEqual([]);

    await context.setOffline(false);
    await expect(page.getByTestId("request-pending")).toBeVisible();
    await expect(page.getByTestId("request-queued")).toHaveCount(0);
    expect(await requestsOf(page.request, me.userId)).toEqual([
      expect.objectContaining({ status: "pending" }),
    ]);
    // Nothing left in the queue: a later reload sends nothing more.
    await page.reload();
    await expect(page.getByTestId("request-pending")).toBeVisible();
    expect(await requestsOf(page.request, me.userId)).toHaveLength(1);
  });
});

test("[P1-11] no button where the server would refuse: no programme yet, or a suspended shop", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const none = await seedShop(page.request, me.userId, { programme: false });
  await page.goto(`/shops/${none.shopId}`);
  await expect(page.getByTestId("shop-vault")).toContainText("hasn’t set up its rewards yet");
  await expect(page.getByTestId("request-points")).toHaveCount(0);

  const paused = await seedShop(page.request, me.userId, { status: "suspended" });
  await page.goto(`/shops/${paused.shopId}`);
  // As the P1-09 spec checks it (toBeVisible flaked on Linux WebKit iphone14 mid-transition, CI 45640478708).
  await expect(page.getByTestId("shop-availability")).toContainText("taking a break");
  await expect(page.getByTestId("request-points")).toHaveCount(0);
});

test("[P1-11] C-68: leaving with a request open cancels it; the shop page then offers to join again", async ({
  page,
  signInAs,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  await page.goto(`/shops/${shopId}`);
  await page.getByTestId("request-points").click();
  await expect(page.getByTestId("request-pending")).toBeVisible();

  await page.getByTestId("shop-leave").click();
  await page
    .getByRole("dialog", { name: `Leave ${SHOP}?` })
    .getByTestId("shop-leave-confirm")
    .click();
  await expect(page).toHaveURL("/wallet");
  await page.waitForLoadState("networkidle");
  expect(await requestsOf(page.request, me.userId)).toEqual([
    expect.objectContaining({ status: "cancelled" }),
  ]);
  await page.goto(`/shops/${shopId}`);
  await expect(page.getByTestId("shop-join")).toBeVisible();
  await expect(page.getByTestId("request-points")).toHaveCount(0);
});

test.describe("live updates", () => {
  test.use({ realtime: true });

  test("[P1-11] the pending state goes by itself when the request expires (realtime)", async ({
    page,
    signInAs,
  }) => {
    const me = await signInAs("customer");
    const { shopId } = await seedShop(page.request, me.userId);
    await page.goto(`/shops/${shopId}`);
    await expect(page.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
    await page.getByTestId("request-points").click();
    await expect(page.getByTestId("request-pending")).toBeVisible();

    const res = await page.request.post("/api/test/expire-request", {
      data: { userId: me.userId, shopId },
      headers: testApiHeaders(),
    });
    expect(await res.json()).toEqual({ expired: 1 });
    // No reload: the stream's hint refreshes the page.
    await expect(page.getByTestId("request-pending")).toHaveCount(0);
    await expect(page.getByTestId("request-points")).toBeVisible();
    expect(await requestsOf(page.request, me.userId)).toEqual([
      expect.objectContaining({ status: "expired" }),
    ]);
  });
});
