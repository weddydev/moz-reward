import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, openSignInLink, test, testApiHeaders, uniqueEmail } from "./support/test";

// P1-04 / journey 1 (TESTING §3) on the production build: scan → Gilded Gate → Collect points → email-link
// sign-in → profile + consent → joined, with the member ID card. Unhappy paths: an international number,
// abandoning the sheet, a shop suspended while the sheet is open, a member re-scanning, and `/shops/[id]`
// for anyone who isn't a member. Screenshots of the sheet and the shop page at 390, 320 and 1440
// (.artifacts/screens/P1-04).

type ShopState = "active" | "restricted" | "suspended";

async function seedShop(
  request: APIRequestContext,
  body: { status: ShopState; name?: string; memberUserId?: string },
): Promise<{ shopId: string; shopCode: string }> {
  const res = await request.post("/api/test/shop", { data: body, headers: testApiHeaders() });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string; shopCode: string };
}

async function setShopStatus(
  request: APIRequestContext,
  shopId: string,
  status: ShopState,
): Promise<void> {
  const res = await request.post("/api/test/shop-status", {
    data: { shopId, status },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
}

const MEMBER_ID = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const UK_ONLY = /Please enter a UK mobile number, like 07400 123456/;

const joinSheet = (page: Page, shopName: string) =>
  page.getByRole("dialog", { name: `Join ${shopName}` });

async function fillProfile(
  page: Page,
  p: { name: string; phone: string; day?: string; month?: string },
): Promise<void> {
  await page.getByLabel("Full name").fill(p.name);
  await page.getByLabel("UK mobile number").fill(p.phone);
  if (p.day) await page.getByLabel("Day").selectOption(p.day);
  if (p.month) await page.getByLabel("Month").selectOption({ label: p.month });
  await page.getByRole("checkbox", { name: "I am 13 or over" }).check();
}

test("[J1][P1-04] scan → gate → Collect points → email link → profile → joined with a member ID", async ({
  page,
  mail,
  shoot,
}) => {
  const shopName = "Brew & Bloom Café";
  const { shopId, shopCode } = await seedShop(page.request, { status: "active", name: shopName });

  await page.goto(`/s/${shopCode}?src=qr`);
  // The gate ends itself (≈ 1.4 s); the CTA underneath is the same one a returning visitor sees.
  await expect(page.getByTestId("gilded-gate")).toBeHidden({ timeout: 5000 });
  await page.getByTestId("landing-collect").click();
  await expect(page).toHaveURL(`/sign-in?returnTo=${encodeURIComponent(`/s/${shopCode}?join=1`)}`);

  const email = uniqueEmail("e2e-join");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = mail.firstLink((await mail.latestTo(email)).text);
  expect(link, "sign-in link in the email").toBeTruthy();
  await openSignInLink(page, link!);

  // Back on the landing with the sheet already open; `?join=1` has done its job and leaves the address.
  const sheet = joinSheet(page, shopName);
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}$`));
  await expect(sheet.getByText("A few details first. You only do this once.")).toBeVisible();
  const marketing = sheet.getByTestId("join-marketing");
  await expect(marketing).not.toBeChecked();
  await shoot("join-sheet-profile", { fullPage: false });

  await fillProfile(page, { name: "Asha Patel", phone: "07400 123456", day: "14", month: "March" });
  await sheet.getByTestId("join-submit").click();

  await expect(page).toHaveURL(`/shops/${shopId}?welcome=1`);
  await expect(page.getByTestId("join-welcome")).toContainText(`Welcome to ${shopName}`);
  await expect(page.getByTestId("member-shop-name")).toHaveText(shopName);
  const card = page.getByTestId("member-card");
  await expect(card).toContainText("Asha Patel");
  const memberId = (await page.getByTestId("member-id").textContent())?.trim() ?? "";
  expect(memberId).toMatch(MEMBER_ID);
  // The phone is never shown back on the page, not even masked (the card carries name + member ID only).
  expect(await page.content()).not.toContain("7400");
  await shoot("shop-page-welcome");

  // Re-scan: a member gets their shop page, never the sheet, and no second membership.
  await page.goto(`/s/${shopCode}?src=qr`);
  await expect(page.getByText("You’re a member")).toBeVisible();
  await expect(page.getByTestId("landing-collect")).toHaveAttribute("href", `/shops/${shopId}`);
  await expect(joinSheet(page, shopName)).toHaveCount(0);
  // Coming back through the sign-in return link as a member goes straight to the shop page.
  await page.goto(`/s/${shopCode}?join=1`);
  await expect(page).toHaveURL(`/shops/${shopId}`);
  await expect(page.getByTestId("join-welcome")).toHaveCount(0);
  await expect(page.getByTestId("member-id")).toHaveText(memberId);
});

test("[J1][P1-04] international number refused with the UK-only message; abandoning keeps nothing; the second shop asks one question", async ({
  page,
  signInAs,
  shoot,
}) => {
  // Viewports are set before a page loads: WebKit keeps an open dialog's `100dvh` from before a programmatic
  // resize (Playwright emulation only; a real Safari recomputes it when its toolbar moves, checked on H-13).
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs("customer", { profile: false });
  const first = await seedShop(page.request, { status: "active", name: "Corner Grocer" });
  await page.goto(`/s/${first.shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, "Corner Grocer");
  await expect(sheet).toBeVisible();

  // Empty submit: field errors, focus on the first one, nothing sent.
  await sheet.getByTestId("join-submit").click();
  await expect(page.getByLabel("Full name")).toBeFocused();
  await expect(sheet.getByText("Please confirm you're 13 or over to join.")).toBeVisible();

  // A French mobile: the server refuses it with the UK-only message on the phone field.
  await fillProfile(page, { name: "Tom Reid", phone: "+33 6 12 34 56 78" });
  await sheet.getByTestId("join-submit").click();
  await expect(sheet.getByText(UK_ONLY)).toBeVisible();
  await expect(page.getByLabel("UK mobile number")).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/s/${first.shopCode}$`));
  await shoot("join-sheet-phone-error", { fullPage: false });

  // Abandon: close and come back later. Nothing was stored, so the sheet asks for the profile again.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(page.getByText("You’re a member")).toHaveCount(0);
  await page.getByTestId("landing-collect").click();
  await expect(page.getByLabel("Full name")).toBeVisible();

  // A valid UK number in international form, marketing ticked on purpose.
  await fillProfile(page, { name: "Tom Reid", phone: "+44 7400 654321" });
  await sheet.getByTestId("join-marketing").check();
  await sheet.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/shops/${first.shopId}?welcome=1`);
  const memberId = (await page.getByTestId("member-id").textContent())?.trim() ?? "";
  expect(memberId).toMatch(MEMBER_ID);

  // A second shop, still restricted by its plan (joining is allowed): one question, no profile fields.
  const second = await seedShop(page.request, { status: "restricted", name: "Late Night Deli" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`/s/${second.shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet2 = joinSheet(page, "Late Night Deli");
  await expect(sheet2.getByText("One question, then you can start collecting.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveCount(0);
  await expect(sheet2.getByTestId("join-marketing")).not.toBeChecked();
  await shoot("join-sheet-one-question-320", { fullPage: false });
  await sheet2.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/shops/${second.shopId}?welcome=1`);
  // The member ID is the same at every shop.
  await expect(page.getByTestId("member-id")).toHaveText(memberId);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shoot("shop-page-welcome-320");
  // Scrolled into view, every action on the page is reachable: none sits under the fixed bottom nav. The last
  // actions on the page (P1-09): the mute switch and "Leave shop".
  for (const action of [
    page.getByRole("switch", { name: "Mute notifications" }),
    page.getByRole("button", { name: "Leave shop" }),
  ]) {
    const name = (await action.textContent()) ?? "";
    await action.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const onTop = await action.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(onTop, name).toBe(true);
  }
});

test("[J1][P1-04] a shop suspended while the sheet is open: the join is refused with a message", async ({
  page,
  signInAs,
  shoot,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs("customer", { profile: false });
  const { shopId, shopCode } = await seedShop(page.request, {
    status: "active",
    name: "Paused Pantry",
  });
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, "Paused Pantry");
  await expect(sheet).toBeVisible();
  await fillProfile(page, { name: "Sam Okafor", phone: "07400 111222" });

  await setShopStatus(page.request, shopId, "suspended");
  await sheet.getByTestId("join-submit").click();
  const error = sheet.getByTestId("join-error");
  await expect(error).toHaveText("This shop isn't taking new members on Moz Rewards right now.");
  // P1-A DES-M1: the message sits by the button, on screen, and the button can only close the sheet now.
  await expect(sheet.locator('[data-part="footer"]').getByTestId("join-error")).toHaveCount(1);
  await expect(error).toBeInViewport();
  await expect(sheet.getByTestId("join-submit")).toHaveText("Close");
  await shoot("join-sheet-not-joinable-390", { fullPage: false });
  await sheet.getByTestId("join-submit").click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}$`));
  // No membership was made: the shop page stays "not found" for this customer.
  await page.goto(`/shops/${shopId}`);
  await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
});

// Under the customer group's loading.tsx the not-found answer streams with status 200 and `noindex` (a soft
// 404, accepted behind sign-in: DECISIONS 12 Nov "catch-all outside (pages)"). What matters is checked here:
// a shop that isn't taking members, an unknown id and a malformed id get the identical not-found page, and the
// HTML never carries the shop's data. Since P1-09 a non-member of a shop that IS taking members gets its public
// sections with the join CTA instead (DECISIONS 19 Nov; tests/e2e/shop-page.spec.ts), never the member ones.
test("[P1-04] /shops/[id] is for members only: everyone else gets the same not-found page", async ({
  page,
  signInAs,
  shoot,
}) => {
  const notMine = await seedShop(page.request, { status: "suspended", name: "Not Joined Café" });
  const joinable = await seedShop(page.request, { status: "active", name: "Open Door Café" });
  // Signed out: the customer gate sends the visitor to sign in first (the id is not looked up).
  await page.goto(`/shops/${joinable.shopId}`);
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);

  await signInAs("customer");
  await page.goto(`/shops/${joinable.shopId}`);
  await expect(page.getByTestId("shop-join")).toBeVisible();
  await expect(page.getByTestId("member-card")).toHaveCount(0);
  for (const path of [
    `/shops/${notMine.shopId}`,
    "/shops/00000000-0000-4000-8000-000000000000",
    "/shops/not-a-uuid",
  ]) {
    const res = await page.goto(path);
    expect([200, 404], path).toContain(res?.status());
    await expect(page.getByRole("heading", { name: "We can't find that page" })).toBeVisible();
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("content") ?? ""));
    expect(robots.length, path).toBeGreaterThan(0);
    for (const content of robots) expect(content, path).toMatch(/noindex/);
    const html = (await res?.text()) ?? "";
    expect(html, path).not.toContain("Not Joined Café");
    expect(html, path).not.toContain(notMine.shopCode);
    expect(html, path).not.toContain('data-testid="member-card"');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await shoot("shop-page-404");
});

test("[P1-04] sheet and shop page at 1440: the sheet is a centred modal", async ({
  page,
  signInAs,
  shoot,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInAs("customer", { profile: false });
  const { shopId, shopCode } = await seedShop(page.request, {
    status: "active",
    name: "Brew & Bloom Café",
  });
  await page.goto(`/s/${shopCode}?join=1`);
  const sheet = joinSheet(page, "Brew & Bloom Café");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("data-kind", "modal");
  const box = await sheet.locator('[data-part="panel"]').boundingBox();
  expect(box).not.toBeNull();
  // Centred, not pinned to the bottom edge like the phone sheet.
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(box!.y + box!.height).toBeLessThan(900 - 16);
  await shoot("join-modal-1440", { fullPage: false });
  await fillProfile(page, { name: "Priya Shah", phone: "07400 333444" });
  await sheet.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/shops/${shopId}?welcome=1`);
  await shoot("shop-page-welcome-1440");
});

test("[P1-04] back after joining shows the member landing, never the stale sheet (P1-A QA-MAJ1)", async ({
  page,
  signInAs,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs("customer", { profile: false });
  const shopName = "Back Button Bakery";
  const { shopId, shopCode } = await seedShop(page.request, { status: "active", name: shopName });
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, shopName);
  await expect(sheet).toBeVisible();
  await fillProfile(page, { name: "Ben Carter", phone: "07400 555666" });
  await sheet.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/shops/${shopId}?welcome=1`);

  // Browser back: the landing the router kept from before the join must not come back.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/s/${shopCode}$`));
  await expect(page.getByText("You’re a member")).toBeVisible();
  await expect(page.getByTestId("landing-collect")).toHaveAttribute("href", `/shops/${shopId}`);
  await page.getByTestId("landing-collect").click();
  await expect(page).toHaveURL(`/shops/${shopId}`);
  await expect(joinSheet(page, shopName)).toHaveCount(0);
});

test("[P1-04] an 80-character shop name wraps; the logo on the shop page stays square (P1-A QA-MAJ2; PD-08 cover)", async ({
  page,
  signInAs,
  shoot,
}) => {
  const shopName =
    "The Extraordinarily Long Named Neighbourhood Coffee House and Bakery of Leeds Co";
  expect(shopName.length).toBe(80);
  const { userId } = await signInAs("customer");
  const { shopId } = await seedShop(page.request, {
    status: "active",
    name: shopName,
    memberUserId: userId,
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/shops/${shopId}`);
    const logo = page.getByTestId("shop-logo");
    await expect(logo).toBeVisible();
    const box = await logo.boundingBox();
    expect(box, `logo at ${String(width)}`).not.toBeNull();
    // The cover's corner logo (PD-08, reference `.s-logo`: 60 px).
    expect(box!.width, `logo width at ${String(width)}`).toBe(60);
    expect(box!.height, `logo height at ${String(width)}`).toBe(60);
    // The name wraps inside the cover (which grows for it), below the back button and clear of the logo.
    const name = await page.getByTestId("member-shop-name").boundingBox();
    const cover = await page.getByTestId("shop-cover").boundingBox();
    const back = await page.getByTestId("shop-back").boundingBox();
    expect(name && cover && back, `boxes at ${String(width)}`).toBeTruthy();
    expect(name!.y, `name below the back button at ${String(width)}`).toBeGreaterThanOrEqual(
      back!.y + back!.height,
    );
    expect(name!.y + name!.height).toBeLessThanOrEqual(cover!.y + cover!.height);
    expect(name!.x + name!.width, `name clear of the logo at ${String(width)}`).toBeLessThanOrEqual(
      box!.x,
    );
    await shoot(`shop-page-long-name-${String(width)}`, { fullPage: false });
  }
});

test("[P1-04] the marketing question is a short label with its details below; a long form fades until scrolled (P1-A DES-M2, DES-M3)", async ({
  page,
  signInAs,
}) => {
  // iPhone SE height: the first-join form runs past the fold here (at 390×844 it now fits, so no fade there).
  await page.setViewportSize({ width: 375, height: 667 });
  await signInAs("customer", { profile: false });
  const shopName = "Fade Mask Florist";
  const { shopCode } = await seedShop(page.request, { status: "active", name: shopName });
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, shopName);
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("checkbox", { name: `Get offers and news from ${shopName}?`, exact: true }),
  ).toHaveCount(1);
  await expect(
    sheet.getByText("We'll send them in the app only, never by email.", { exact: false }),
  ).toBeVisible();
  const body = sheet.locator('[data-part="body"]');
  await expect(body).toHaveAttribute("data-overflow");
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(body).not.toHaveAttribute("data-overflow");
});

test("[P1-04] a double tap on Join makes one join and still shows the welcome (P1-A QA minor 4)", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  const shopName = "Double Tap Deli";
  const { shopId, shopCode } = await seedShop(page.request, { status: "active", name: shopName });
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, shopName);
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("join-submit").dblclick();
  await expect(page).toHaveURL(`/shops/${shopId}?welcome=1`);
  await expect(page.getByTestId("join-welcome")).toBeVisible();
});

test("[P1-04] a session that ends while the sheet is open goes to sign-in and back to the sheet (P1-A QA minor 3)", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  const shopName = "Expired Espresso";
  const { shopCode } = await seedShop(page.request, { status: "active", name: shopName });
  await page.goto(`/s/${shopCode}`);
  await page.getByTestId("landing-collect").click();
  const sheet = joinSheet(page, shopName);
  await expect(sheet).toBeVisible();
  await page.context().clearCookies();
  await sheet.getByTestId("join-submit").click();
  await expect(page).toHaveURL(`/sign-in?returnTo=${encodeURIComponent(`/s/${shopCode}?join=1`)}`);
});
