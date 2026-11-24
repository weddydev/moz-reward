import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test, testApiHeaders } from "./support/test";

// P1-09 on the production build: the customer shop page (screen 4) for a member and for a non-member, "Mute
// notifications" and "Leave shop" (confirm sheet, enforced by the server), and a rejoin that restores the
// frozen progress. Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-09).

type Seeded = { shopId: string; shopCode: string };
const SHOP = "Brew & Bloom Café";

async function seedShop(
  request: APIRequestContext,
  userId: string | null,
  over: Record<string, unknown> = {},
): Promise<Seeded> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: SHOP,
      details: true,
      programme: "sample",
      closureInDays: 2,
      ...(userId ? { memberUserId: userId, member: { purchaseCount: 5, progressGold: 720 } } : {}),
      ...over,
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Seeded;
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const leaveSheet = (page: Page) => page.getByRole("dialog", { name: `Leave ${SHOP}?` });

test("[P1-09] member shop page: cover, status, directions and call, vault card, member card, receipts, details", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  await page.goto(`/shops/${shopId}`);

  await expect(page.getByRole("heading", { level: 1, name: SHOP })).toBeVisible();
  await expect(page.getByTestId("shop-cover")).toBeVisible();
  await expect(page.getByTestId("shop-status")).toHaveText(/^(Open · closes|Closes soon|Closed)/);
  await expect(page.getByTestId("shop-directions")).toHaveAttribute(
    "href",
    "https://www.google.com/maps/dir/?api=1&destination=51.5245%2C-0.0754",
  );
  await expect(page.getByTestId("shop-call")).toHaveAttribute("href", "tel:+442071234567");

  const vault = page.getByTestId("shop-vault");
  await expect(vault.getByRole("img", { name: "720 of 1,000 gold, 72%" })).toBeAttached();
  await expect(page.getByTestId("shop-vault-percent")).toHaveText("72%");
  // The compact Gold Vault line under the cover (PD-11, C-80) carries the gold.
  await expect(page.getByTestId("mini-vault")).toContainText("Gold Vault720 / 1,000");
  // The sample programme: 25% and 50% reached, the 75% step is a mystery not reached yet.
  await expect(page.getByTestId("shop-vault-next")).toHaveText("Next: Mystery reward at 75%");
  expect(await page.content()).not.toContain("Secret brownie");

  await expect(page.getByTestId("member-card")).toBeVisible();
  await expect(page.getByTestId("shop-receipts")).toContainText("No receipts yet");
  await expect(page.getByTestId("shop-hours")).toContainText("Monday");
  await expect(page.getByTestId("shop-closures")).toContainText("Staff training");
  await expect(page.getByTestId("shop-address")).toHaveText("12 High Street, Shoreditch, E1 6AN");
  await expect(page.getByTestId("shop-about")).toContainText("Small-batch coffee");
  await expect(page.getByTestId("shop-mute").getByRole("switch")).not.toBeChecked();
  // Slots later tasks fill stay out of the page until then (no dead buttons).
  await expect(page.getByRole("button", { name: /request points|member qr/i })).toHaveCount(0);

  // The pour plays on every view of the page (DESIGN §8.2) and lands on the member's level.
  await expect(page.locator(".ingot-pour")).toHaveAttribute("data-ingot-state", "done");

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    await shoot(`shop-page-${String(width)}`);
  }

  await page.getByTestId("shop-vault-link").click();
  await expect(page).toHaveURL(`/vault/${shopId}`);
});

test("[P1-09] mute notifications: immediate, kept after a reload, and back off again", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  await page.goto(`/shops/${shopId}`);
  const toggle = page.getByTestId("shop-mute").getByRole("switch");
  await expect(toggle).toBeEnabled();

  // The whole action response (its body carries the refreshed page) before reloading: a reload mid-body is
  // an aborted fetch ("Load failed" in WebKit), not what is being tested.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await toggle.click();
  await expect(toggle).toBeChecked();
  await (await saved).finished();
  await page.reload();
  await expect(toggle).toBeChecked();

  const unsaved = page.waitForResponse((r) => r.request().method() === "POST" && r.ok());
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await (await unsaved).finished();
  await page.reload();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByTestId("shop-mute-error")).toHaveCount(0);
});

test("[P1-09] leave on day 1: the sheet explains the 30-day window, the shop leaves the Wallet, rejoin restores the gold", async ({
  page,
  signInAs,
  shoot,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const me = await signInAs("customer");
  const { shopId, shopCode } = await seedShop(page.request, me.userId);
  await page.goto(`/shops/${shopId}`);

  // "Stay a member" closes the sheet and changes nothing.
  await page.getByTestId("shop-leave").click();
  const sheet = leaveSheet(page);
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("shop-leave-terms")).toContainText(
    /Rejoin by \d{1,2} [A-Z][a-z]{2} \d{4} and you pick up where you left off/,
  );
  await expect(page.getByTestId("shop-leave-terms")).toContainText(
    "Rewards you’ve unlocked are kept until their own expiry date.",
  );
  await shoot("shop-leave-sheet-390", { fullPage: false });
  await sheet.getByRole("button", { name: "Stay a member" }).click();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("member-card")).toBeVisible();

  // Leave: straight to the Wallet, which no longer lists the shop.
  await page.getByTestId("shop-leave").click();
  await leaveSheet(page).getByTestId("shop-leave-confirm").click();
  await expect(page).toHaveURL("/wallet");
  await expect(page.getByRole("link", { name: new RegExp(SHOP) })).toHaveCount(0);

  // The shop page now shows a non-member the join CTA instead of the member sections.
  await page.goto(`/shops/${shopId}`);
  await expect(page.getByRole("heading", { level: 1, name: SHOP })).toBeVisible();
  await expect(page.getByTestId("shop-join")).toBeVisible();
  await expect(page.getByTestId("member-card")).toHaveCount(0);
  await expect(page.getByTestId("shop-vault")).toHaveCount(0);
  await expect(page.getByTestId("mini-vault")).toHaveCount(0);
  await expect(page.getByTestId("shop-settings")).toHaveCount(0);
  await shoot("shop-page-non-member-390");

  // Rejoin the same day from the landing page: the frozen gold is back, nothing extra was paid.
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const join = page.getByRole("dialog", { name: `Join ${SHOP}` });
  await expect(join.getByTestId("join-marketing")).not.toBeChecked();
  await join.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/shops/${shopId}?welcome=1`);
  await expect(page.getByTestId("mini-vault")).toContainText("720 / 1,000");
});

test("[P1-09] leave from a stale second tab: the second leave lands on the Wallet too", async ({
  page,
  context,
  signInAs,
}) => {
  const me = await signInAs("customer");
  const { shopId } = await seedShop(page.request, me.userId);
  const other = await context.newPage();
  await page.goto(`/shops/${shopId}`);
  await other.goto(`/shops/${shopId}`);

  await page.getByTestId("shop-leave").click();
  await leaveSheet(page).getByTestId("shop-leave-confirm").click();
  await expect(page).toHaveURL("/wallet");

  await other.getByTestId("shop-leave").click();
  await leaveSheet(other).getByTestId("shop-leave-confirm").click();
  await expect(other).toHaveURL("/wallet");
  await expect(other.getByTestId("shop-leave-error")).toHaveCount(0);
});

test("[P1-09] non-members: join CTA for a shop taking members, not-found for the rest", async ({
  page,
  signInAs,
  shoot,
}) => {
  await signInAs("customer");
  const open = await seedShop(page.request, null);
  const suspended = await seedShop(page.request, null, { status: "suspended", name: "Shut Café" });

  await page.goto(`/shops/${open.shopId}`);
  await expect(page.getByRole("heading", { level: 1, name: SHOP })).toBeVisible();
  await expect(page.getByTestId("shop-details")).toBeVisible();
  await expect(page.getByTestId("member-card")).toHaveCount(0);
  await page.getByTestId("shop-join").getByTestId("landing-collect").click();
  await expect(page.getByRole("dialog", { name: `Join ${SHOP}` })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await shoot("shop-page-non-member-1440");

  for (const path of [
    `/shops/${suspended.shopId}`,
    "/shops/00000000-0000-4000-8000-000000000000",
    "/shops/not-a-uuid",
  ]) {
    const res = await page.goto(path);
    await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
    const html = (await res?.text()) ?? "";
    expect(html, path).not.toContain("Shut Café");
    expect(html, path).not.toContain(suspended.shopCode);
  }
});
