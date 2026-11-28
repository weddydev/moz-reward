import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { expect, newClientContext, test, testApiHeaders } from "./support/test";

// P2-01 on the production build: the shop dashboard's Overview. A member's request reaches the live queue of every
// open Overview tab of that shop without a reload (`/api/test/relay-realtime` does the worker's publish job), an
// approve from the Overview removes it from both tabs, and the KPIs and the weekly chart count the visit. The plan
// banner is the owner's: a staff render of the same shop carries none of it. Screenshots at 390, 320 and 1440
// (.artifacts/screens/P2-01).

const NAME = "Aisha Khan"; // makeCustomerProfile's default name
test.use({ realtime: true });
/** An approval under 10 parallel workers on a laptop can take seconds (alone: ~0.1 s). */
const DECIDE_MS = 15_000;
/** P2-01 acceptance: a new request shows in the live queue within 3 s of its hint, no reload. */
const LIVE_MS = 3_000;

async function session(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ userId: string }> {
  const res = await request.post("/api/test/session", { data, headers: testApiHeaders() });
  expect(res.status(), "test session").toBe(200);
  return (await res.json()) as { userId: string };
}

async function seedShop(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: { name: "Brew & Bloom Café", details: true, programme: "sample", ...data },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

async function relay(request: APIRequestContext, shopId: string): Promise<number> {
  const res = await request.post("/api/test/relay-realtime", {
    data: { shopId },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { delivered: number }).delivered;
}

async function device(
  browser: Browser,
  baseURL: string,
  data: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page; userId: string }> {
  const context = await newClientContext(browser, baseURL);
  const { userId } = await session(context.request, data);
  return { context, page: await context.newPage(), userId };
}

async function openOverview(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.getByTestId("shop-realtime")).toHaveAttribute("data-realtime", "open");
}

const kpi = (page: Page, key: string) => page.locator(`[data-kpi="${key}"]`);

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P2-01] Overview: a request appears live in every tab, an inline approve removes it from both, KPIs count it", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  // Two devices, two tabs, several loads and three resizes: Linux WebKit can draw no frame for seconds (KI-10).
  test.setTimeout(120_000);
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedShop(page.request, {
      status: "active",
      memberUserId: member.userId,
      member: { purchaseCount: 5, progressGold: 720, lastVisitDaysAgo: 3 },
    });
    await signInAs("owner", { shopId });
    await openOverview(page);
    const second = await page.context().newPage();
    await openOverview(second);

    // A new day for this shop: every KPI at 0, each sparkline exactly 7 points, the chart 7 bars, no plan banner.
    for (const key of ["visits", "gold", "joins", "claims"]) {
      await expect(kpi(page, key)).toHaveAttribute("data-series", /^\d+(,\d+){6}$/);
    }
    await expect(kpi(page, "visits")).toContainText("Visits today0");
    await expect(kpi(page, "gold")).toContainText("Gold issued today0");
    await expect(page.getByTestId("visits-chart").locator("[data-bar]")).toHaveCount(7);
    await expect(page.getByTestId("plan-banner")).toHaveCount(0);
    await expect(page.getByTestId("requests-empty")).toBeVisible();
    await expect(page.getByTestId("overview-queue-count")).toHaveText(" (0)");
    await expect(page.getByTestId("scan-member-qr")).toHaveAttribute("href", "/dashboard/scan");
    if ((page.viewportSize()?.width ?? 0) < 1024)
      await expect(page.getByTestId("scan-member-qr")).toBeVisible();

    // The member asks for gold; both tabs show the row with no reload.
    await member.page.goto(`/shops/${shopId}`);
    await expect(member.page.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
    await member.page.getByTestId("request-points").click();
    await expect(member.page.getByTestId("request-pending")).toBeVisible();
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    for (const tab of [page, second]) {
      const row = tab.getByTestId("overview-queue").getByTestId("request-row");
      await expect(row).toHaveCount(1, { timeout: LIVE_MS });
      await expect(row.getByTestId("request-name")).toHaveText(NAME);
      await expect(tab.getByTestId("overview-queue-count")).toHaveText(" (1)");
    }

    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noHorizontalScroll(page);
      await shoot(`overview-${String(width)}`);
    }
    // One Scan button at a time: the page's on phones, the shell header's from 1024 px (KI-91).
    await expect(page.getByTestId("scan-member-qr")).toBeHidden();
    await shoot("overview-1440-viewport", { fullPage: false });

    // Approve from the Overview: the row leaves this tab at once and the other tab on the next hint.
    await page
      .getByTestId("overview-queue")
      .getByRole("button", { name: `Approve ${NAME}` })
      .click();
    const form = page.getByTestId("approve-form");
    await expect(form).toBeVisible();
    await form.getByTestId("approve-submit").click();
    await expect(page.getByRole("region", { name: "Notifications" })).toContainText(
      `Approved: +100 gold for ${NAME}.`,
      { timeout: DECIDE_MS },
    );
    await expect(page.getByTestId("overview-queue").getByTestId("request-row")).toHaveCount(0);
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    await expect(second.getByTestId("overview-queue").getByTestId("request-row")).toHaveCount(0, {
      timeout: LIVE_MS,
    });

    // The visit counts today: KPIs, today's sparkline point and today's bar.
    await expect(kpi(page, "visits")).toContainText("Visits today1");
    await expect(kpi(page, "gold")).toContainText("Gold issued today100");
    await expect(kpi(page, "visits")).toHaveAttribute("data-series", /,1$/);
    await expect(page.getByTestId("visits-chart").locator("[data-bar]").last()).toHaveAttribute(
      "data-value",
      "1",
    );
    await expect(page.getByTestId("overview-visits")).toContainText(
      "1 member visit in the last 7 days.",
    );
  } finally {
    await member.context.close();
  }
});

test("[P2-01] the plan banner is the owner's: grace and restricted show it, a staff render carries none of it", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  const { shopId } = await seedShop(page.request, { status: "grace" });
  await signInAs("owner", { shopId });
  await page.goto("/dashboard");
  const banner = page.getByTestId("plan-banner");
  await expect(banner).toContainText("Your plan has ended");
  await expect(banner).toHaveAttribute("data-tone", "warning");
  await expect(banner.getByRole("link", { name: "View plan" })).toHaveAttribute(
    "href",
    "/dashboard/settings",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot("overview-plan-banner-390");

  // Staff of the same shop: no banner, and the server never sent its words (not hidden by CSS).
  const staff = await newClientContext(browser, baseURL ?? "");
  try {
    await session(staff.request, { role: "staff", shopId });
    const res = await staff.request.get("/dashboard");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Overview");
    // The sidebar's plan footer shows staff the state ("Ended: grace period", DECISIONS 13 Nov "shell plan
    // footer"); the banner's own words and its renew prompt are the owner's.
    for (const words of ["Your plan has ended", "Renew now", "plan-banner"]) {
      expect(html, `staff HTML must not carry "${words}"`).not.toContain(words);
    }
    const staffPage = await staff.newPage();
    await staffPage.goto("/dashboard");
    await expect(staffPage.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(staffPage.getByTestId("plan-banner")).toHaveCount(0);
  } finally {
    await staff.close();
  }

  // Restricted: the owner's banner turns to the read-only warning.
  const res = await page.request.post("/api/test/shop-status", {
    data: { shopId, status: "restricted" },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(banner).toContainText("Your dashboard is read-only");
  await expect(banner).toHaveAttribute("data-tone", "danger");
});
