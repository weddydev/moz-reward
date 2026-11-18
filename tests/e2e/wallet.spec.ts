import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test, testApiHeaders } from "./support/test";

// P1-07 Wallet on the production build: seed memberships render in PRODUCT §4 order with engine progress, the
// summary strip, a suspended shop greyed with its state, a 60-character name without a layout break, the empty
// state, card → shop page, and pull-to-refresh re-rendering on the server. Screenshots at 390, 320 and 1440
// (.artifacts/screens/P1-07).

type Member = {
  purchaseCount?: number;
  progressGold?: number;
  ingotsCompleted?: number;
  lastVisitDaysAgo?: number;
};

async function seedMembership(
  request: APIRequestContext,
  userId: string,
  body: {
    name: string;
    status?: "active" | "suspended" | "closed";
    programme?: boolean;
    details?: boolean;
    member?: Member;
  },
): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: { status: "active", ...body, memberUserId: userId },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

/** 60 characters exactly (DESIGN edge case: ellipsis, no layout break). */
const LONG_NAME = "The Extraordinarily Long-Named Neighbourhood Coffee House Ltd";

const cards = (page: Page) => page.getByTestId("wallet-card");

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P1-07] wallet: memberships in order with progress, summary, a suspended shop and a long name", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  const brew = await seedMembership(page.request, me.userId, {
    name: "Brew & Bloom Café",
    programme: true,
    details: true,
    member: { purchaseCount: 12, progressGold: 720, ingotsCompleted: 3, lastVisitDaysAgo: 2 },
  });
  await seedMembership(page.request, me.userId, {
    name: LONG_NAME,
    programme: true,
    member: { purchaseCount: 12, progressGold: 500, ingotsCompleted: 1, lastVisitDaysAgo: 1 },
  });
  await seedMembership(page.request, me.userId, {
    name: "Corner Grocer",
    member: { purchaseCount: 2 },
  });
  await seedMembership(page.request, me.userId, {
    name: "Paused Barber",
    status: "suspended",
    programme: true,
    member: { purchaseCount: 1, progressGold: 100 },
  });

  await page.goto("/wallet");
  await expect(page.getByRole("heading", { level: 1, name: "Wallet", exact: true })).toBeAttached();
  await expect(page.getByTestId("wallet-greeting")).toHaveText(/^Good (morning|afternoon|evening)/);

  // PRODUCT §4: purchase count desc → current points desc → last visit desc.
  await expect(cards(page)).toHaveCount(4);
  const names = await cards(page).evaluateAll((els) =>
    els.map((el) => el.querySelector("p")?.textContent ?? ""),
  );
  expect(names).toEqual(["Brew & Bloom Café", LONG_NAME, "Corner Grocer", "Paused Barber"]);

  const first = cards(page).first();
  await expect(first).toHaveAttribute("href", `/shops/${brew.shopId}`);
  await expect(first).toContainText("72%");
  await expect(first.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
  await expect(first).toHaveAttribute("aria-label", /720 \/ 1,000 gold/);
  await expect(cards(page).nth(1)).toContainText("50%");
  await expect(cards(page).nth(2)).toContainText("Rewards not set up yet");
  const paused = cards(page).nth(3);
  await expect(paused).toHaveAttribute("data-availability", "suspended");
  await expect(paused).toContainText("Taking a break");

  await expect(page.getByTestId("summary-ingots")).toContainText("4");
  await expect(page.getByTestId("summary-ingots")).toContainText("Ingots filled");
  await expect(page.getByTestId("summary-rewards")).toContainText("0");

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    // The long name stays within its card (clamped to two lines with an ellipsis).
    const nameBox = await cards(page).nth(1).locator("p").first().boundingBox();
    const cardBox = await cards(page).nth(1).boundingBox();
    expect(nameBox && cardBox && nameBox.x + nameBox.width <= cardBox.x + cardBox.width + 0.5).toBe(
      true,
    );
    const rightColumn = page.getByTestId("wallet-rewards-ready");
    if (width === 1440) await expect(rightColumn).toBeVisible();
    else await expect(rightColumn).toBeHidden();
    await shoot(`wallet-${String(width)}`, { fullPage: true });
  }

  // Desktop grid: three cards side by side at 1440.
  const tops = await cards(page).evaluateAll((els) =>
    els.slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  expect(new Set(tops).size).toBe(1);

  // A card opens the shop page.
  await page.setViewportSize({ width: 390, height: 844 });
  await first.click();
  await expect(page).toHaveURL(`/shops/${brew.shopId}`);
  await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
});

test("[P1-07] wallet: no memberships shows the empty state with scan guidance", async ({
  page,
  signInAs,
  shoot,
}) => {
  await signInAs("customer");
  await page.goto("/wallet");
  const empty = page.getByTestId("wallet-empty");
  await expect(empty).toContainText("No shops yet");
  await expect(empty).toContainText("Scan a shop's QR code");
  await expect(empty.getByRole("link", { name: "Scan a QR code" })).toHaveAttribute(
    "href",
    "/scan",
  );
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByTestId("summary-ingots")).toContainText("0");
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await noHorizontalScroll(page);
    await shoot(`wallet-empty-${String(width)}`);
  }
});

test("[P1-07] wallet: pull to refresh on a phone re-renders on the server without a reload", async ({
  page,
  signInAs,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "touch input is driven through Chromium's DevTools protocol",
  );
  const me = await signInAs("customer");
  await seedMembership(page.request, me.userId, { name: "First Shop", programme: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  await expect(cards(page)).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  // Joined somewhere else meanwhile.
  await seedMembership(page.request, me.userId, {
    name: "Second Shop",
    programme: true,
    member: { purchaseCount: 5 },
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const indicator = page.getByTestId("pull-indicator");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 195, y: 120 }],
  });
  // A short pull isn't enough.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 195, y: 160 }],
  });
  await expect(indicator).toHaveAttribute("data-armed", "false");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: 195, y: 300 }],
  });
  await expect(indicator).toHaveAttribute("data-armed", "true");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText("Second Shop");
  expect(
    await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
  ).toBe(true);
  // The outline is put away once the refresh lands.
  await expect(indicator).toHaveAttribute("data-pulling", "false");
});
