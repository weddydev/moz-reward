import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { expect, newClientContext, test, testApiHeaders } from "./support/test";

// P1-16 journey 3 on the production build: an ingot fills → the reward is ready → the member taps Redeem (Gold
// Vault, Wallet, the celebration's reward card) → a 6-character code with its 15-minute ring → a team member
// types it on the Requests page → "Redeemed" on both sides, live (`/api/test/relay-realtime` does the worker's
// publish job). Unhappy paths: a second code voids the first; another shop's team can't use it; an expired
// code. Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-16).

test.use({ realtime: true });
const SHOP = "Brew & Bloom Café";
/** A confirm or an approval under parallel workers on a laptop can take seconds (alone: ~0.1 s). */
const SERVER_MS = 15_000;
const CODE = /^[2-9A-HJKMNP-TV-Z]{6}$/;

/** A shop with the sample programme; the member one visit from a full ingot, then that visit approved. */
async function seedReward(
  request: APIRequestContext,
  userId: string,
  opts: { celebrate?: boolean } = {},
): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: SHOP,
      details: true,
      programme: "sample",
      memberUserId: userId,
      member: { purchaseCount: 9, progressGold: 950, lastVisitDaysAgo: 2 },
      visits: 1,
      celebrate: opts.celebrate ?? false,
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

async function relay(request: APIRequestContext, shopId: string): Promise<void> {
  const res = await request.post("/api/test/relay-realtime", {
    data: { shopId },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
}

/** Another device, signed in: the member's phone, or another shop's team member. */
async function device(
  browser: Browser,
  baseURL: string,
  data: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page; userId: string }> {
  const context = await newClientContext(browser, baseURL);
  const res = await context.request.post("/api/test/session", { data, headers: testApiHeaders() });
  expect(res.status(), "test session").toBe(200);
  const { userId } = (await res.json()) as { userId: string };
  return { context, page: await context.newPage(), userId };
}

/** The code on screen, read from the digits' accessible name ("Redeem code K 7 Q 4 2 M"). */
async function shownCode(page: Page): Promise<string> {
  const digits = page.getByTestId("redeem-code").getByRole("img");
  // The Redeem round trip (3 s more where a spec holds the response back, C-81) under parallel workers.
  await expect(digits).toHaveAttribute("aria-label", /^Redeem code( [2-9A-HJKMNP-TV-Z]){6}$/, {
    timeout: SERVER_MS,
  });
  const label = (await digits.getAttribute("aria-label")) ?? "";
  const code = label.replace("Redeem code", "").replace(/\s/g, "");
  expect(code).toMatch(CODE);
  return code;
}

/**
 * Types the code and confirms, once React owns the field (KI-20: a value typed before hydration is reset by it;
 * Linux WebKit, CI 45896261969), and checks the field kept what was typed (upper-cased, as the field shows it).
 */
async function confirm(staff: Page, code: string): Promise<void> {
  await staff.waitForFunction(
    () =>
      document.documentElement.dataset.hydrated === "true" &&
      !document.querySelector("[data-hydrating]"),
  );
  const field = staff.getByTestId("redeem-confirm-code");
  await expect(field).toBeEnabled();
  await field.fill(code);
  await expect(field).toHaveValue(code.toUpperCase());
  await staff.getByTestId("redeem-confirm-submit").click();
}

/** The `shoot` fixture's picture of another device's page (same folder and naming, viewport only). */
async function shootOn(page: Page, name: string): Promise<void> {
  const dir = path.join(".artifacts", "screens", "J3");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}--${test.info().project.name}.png`),
    animations: "disabled",
    caret: "initial",
  });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[J3][P1-16] Gold Vault: Redeem shows the code; the team confirms it; the member sees Redeemed live", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedReward(page.request, member.userId);
    await signInAs("staff", { shopId });
    await page.goto("/dashboard/requests");
    await expect(page.getByTestId("redeem-confirm")).toBeVisible();

    await member.page.setViewportSize({ width: 390, height: 844 });
    await member.page.goto(`/vault/${shopId}`);
    await expect(member.page.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
    const list = member.page.getByTestId("vault-rewards").getByTestId("reward-ready");
    // The sample's three milestones were never reached: they unlock with the main reward (4 in all).
    await expect(list).toHaveCount(4);
    await expect(list.first()).toContainText(/Valid until \d{1,2} [A-Z][a-z]{2} \d{4}/);
    await list.first().getByTestId("reward-redeem").click();
    const sheet = member.page.getByTestId("redeem-sheet");
    await expect(sheet).toBeVisible();
    // Each row carries its reward's photo (human, 27 Nov: no empty image slots).
    await expect(list.first().locator("img.m-r-thumb, .m-r-coin")).toHaveCount(1);
    // The sheet has its own particle canvas above it: Redeem's sparks and coins never fall behind it (human, 27 Nov).
    await expect(member.page.locator("dialog[open] > canvas.m-fx")).toHaveCount(1);
    // C-81: the Redeem response held back 3 s on the network. The ring still starts from the response (15:00),
    // not from the tap or the server's send (which would read 14:56).
    await member.page.route(`**/vault/${shopId}`, async (route) => {
      if (route.request().method() !== "POST" || !route.request().headers()["next-action"])
        return route.fallback();
      const res = await route.fetch();
      await new Promise((r) => setTimeout(r, 3_000));
      await route.fulfill({ response: res });
    });
    await sheet.getByTestId("redeem-button").click();
    const code = await shownCode(member.page);
    await expect(sheet.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /^Code expires in (15:00|14:5[89])$/,
    );
    await member.page.unrouteAll({ behavior: "wait" });
    await expect
      .poll(() =>
        sheet.evaluate((el) =>
          el.getAnimations({ subtree: true }).every((a) => a.playState !== "running"),
        ),
      )
      .toBe(true);
    await noHorizontalScroll(member.page);
    await shootOn(member.page, "redeem-code-390");
    await member.page.setViewportSize({ width: 320, height: 640 });
    await noHorizontalScroll(member.page);
    await shootOn(member.page, "redeem-code-320");

    // The team confirms it, typed as the customer reads it (lower case, with a space).
    await confirm(page, `${code.slice(0, 3).toLowerCase()} ${code.slice(3)}`);
    await expect(page.getByTestId("redeem-confirmed")).toContainText("Redeemed:", {
      timeout: SERVER_MS,
    });
    await shoot("staff-confirm-1440");
    await page.setViewportSize({ width: 320, height: 640 });
    await noHorizontalScroll(page);
    await shoot("staff-confirm-320");

    // A second confirm of the same code.
    await confirm(page, code);
    await expect(page.getByTestId("redeem-confirm")).toContainText("Already redeemed.", {
      timeout: SERVER_MS,
    });

    // The member's sheet hears it live and says so; the list loses that reward.
    await relay(page.request, shopId);
    await expect(member.page.getByTestId("redeem-done")).toContainText("Redeemed", {
      timeout: SERVER_MS,
    });
    await member.page.keyboard.press("Escape");
    await expect(list).toHaveCount(3, { timeout: SERVER_MS });
  } finally {
    await member.context.close();
  }
});

test("[J3][P1-16] Wallet at 1440: rewards ready with Redeem; a second code voids the first; other shops and expired codes fail", async ({
  page,
  browser,
  baseURL,
  signInAs,
}) => {
  test.setTimeout(120_000);
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  const other = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedReward(page.request, member.userId);
    // Another shop, with its own team member signed in on another device.
    const { shopId: otherShopId } = await seedReward(page.request, other.userId);
    await signInAs("staff", { shopId });
    await page.goto("/dashboard/requests");
    const stranger = await device(browser, baseURL ?? "", { role: "staff", shopId: otherShopId });

    await member.page.setViewportSize({ width: 1440, height: 900 });
    await member.page.goto("/wallet");
    const ready = member.page.getByTestId("wallet-rewards-ready");
    await expect(ready.getByRole("heading")).toHaveText("Rewards ready");
    const rows = ready.getByTestId("reward-ready");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText(SHOP);
    await expect(rows.first()).toContainText(/Valid until/);
    await shootOn(member.page, "wallet-rewards-1440");
    // C-67: the Gold Vault's "Rewards ready" at 1440 (390 is the first test's).
    await member.page.goto(`/vault/${shopId}`);
    const vaultCard = member.page.getByTestId("vault-rewards");
    // Visible, not only present: streamed content sits hidden in the DOM until it swaps in.
    // A cold first load on Linux WebKit swaps the stream in after more than 5 s (KI-10; spec-repeat 45899478122).
    await expect(vaultCard.getByTestId("reward-ready").first()).toBeVisible({ timeout: SERVER_MS });
    await expect(vaultCard.getByTestId("reward-ready")).toHaveCount(4);
    await expect(vaultCard.getByTestId("reward-redeem")).toHaveCount(4);
    await vaultCard.scrollIntoViewIfNeeded();
    await shootOn(member.page, "vault-rewards-1440");
    await member.page.goto("/wallet");

    await rows.first().getByTestId("reward-redeem").click();
    const sheet = member.page.getByTestId("redeem-sheet");
    await sheet.getByTestId("redeem-button").click();
    const first = await shownCode(member.page);
    // Close and Redeem again: a new code, and the first one is void.
    await member.page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await rows.first().getByTestId("reward-redeem").click();
    await member.page.getByTestId("redeem-sheet").getByTestId("redeem-button").click();
    const second = await shownCode(member.page);
    expect(second).not.toBe(first);

    await confirm(page, first);
    await expect(page.getByTestId("redeem-confirm")).toContainText("replaced by a newer one", {
      timeout: SERVER_MS,
    });
    // Another shop's team: the same answer as a wrong code, and the code stays usable.
    await stranger.page.goto("/dashboard/requests");
    await confirm(stranger.page, second);
    await expect(stranger.page.getByTestId("redeem-confirm")).toContainText("Code not recognised", {
      timeout: SERVER_MS,
    });
    // Expired.
    const res = await page.request.post("/api/test/expire-redeem-codes", {
      data: { shopId },
      headers: testApiHeaders(),
    });
    expect(((await res.json()) as { expired: number }).expired).toBe(1);
    await confirm(page, second);
    await expect(page.getByTestId("redeem-confirm")).toContainText("This code has expired", {
      timeout: SERVER_MS,
    });
    await stranger.context.close();
  } finally {
    await member.context.close();
    await other.context.close();
  }
});

test("[J3][P1-16] the celebration's reward card carries Redeem and shows the code", async ({
  page,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  const me = await signInAs("customer");
  await seedReward(page.request, me.userId, { celebrate: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  const m = page.getByTestId("celebration");
  await expect(m).toHaveAttribute("data-state", "unlocked", { timeout: SERVER_MS });
  const card = m.getByTestId("reward-card");
  await card.getByTestId("redeem-button").click();
  await shownCode(page);
  await expect(card.getByTestId("redeem-code")).toBeVisible();
  await expect
    .poll(() =>
      card.evaluate((el) =>
        el.getAnimations({ subtree: true }).every((a) => a.playState !== "running"),
      ),
    )
    .toBe(true);
  await noHorizontalScroll(page);
  await shoot("celebration-redeem-390", { fullPage: false });
});

test.describe("redeem by keyboard, and with no connection", () => {
  // The aborted Redeem round trip is the point of this test (the guard still fails on anything else).
  test.use({
    // One pattern: a two-item array would read as Playwright's [value, options] fixture form.
    guardAllow: [
      /^(requestfailed: POST http:\/\/localhost:\d+\/(vault\/[0-9a-f-]{36}|dashboard\/requests) |console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED$)/,
    ],
  });

  test("[J3][P1-16] Redeem by keyboard keeps focus in the card and says the code; no connection offers a retry", async ({
    page,
    signInAs,
  }) => {
    // Design review HIGH + code review M5 (P1-D close): the pressed button is replaced by the code, so focus
    // moves to it and one live region says it; a failed round trip is an error with Redeem again, not a spinner.
    test.setTimeout(90_000);
    const me = await signInAs("customer");
    const { shopId } = await seedReward(page.request, me.userId);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/vault/${shopId}`);
    const list = page.getByTestId("vault-rewards").getByTestId("reward-ready");
    await expect(list).toHaveCount(4);
    await list.first().getByTestId("reward-redeem").click();
    const sheet = page.getByTestId("redeem-sheet");
    await expect(sheet).toBeVisible();
    await page.route(`**/vault/${shopId}`, (route) =>
      route.request().method() === "POST" && route.request().headers()["next-action"]
        ? route.abort("internetdisconnected")
        : route.fallback(),
    );
    const redeem = sheet.getByTestId("redeem-button");
    await redeem.focus();
    await page.keyboard.press("Enter");
    await expect(sheet.getByTestId("redeem-error")).toHaveText("No connection. Try again.", {
      timeout: SERVER_MS,
    });
    await expect(redeem).toBeEnabled();
    await expect(redeem).toBeFocused();
    await page.unrouteAll({ behavior: "wait" });
    await page.keyboard.press("Enter");
    const code = await shownCode(page);
    await expect(sheet.getByTestId("redeem-flow").locator("[data-focus-target]")).toBeFocused();
    await expect(sheet.getByTestId("redeem-live")).toHaveText(
      `Your code is ${code.split("").join(" ")}. Show it at the till. It works once.`,
    );
  });

  test("[J3][P1-16] staff Confirm with no connection says so and keeps the code to try again", async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(90_000);
    const me = await signInAs("customer");
    const { shopId } = await seedReward(page.request, me.userId);
    await signInAs("staff", { shopId });
    await page.goto("/dashboard/requests");
    await expect(page.getByTestId("redeem-confirm")).toBeVisible();
    await page.route("**/dashboard/requests", (route) =>
      route.request().method() === "POST" && route.request().headers()["next-action"]
        ? route.abort("internetdisconnected")
        : route.fallback(),
    );
    await confirm(page, "K7Q42M");
    const field = page.getByTestId("redeem-confirm-code");
    await expect(page.getByTestId("redeem-confirm")).toContainText("No connection. Try again.", {
      timeout: SERVER_MS,
    });
    await expect(page.getByTestId("redeem-confirm-submit")).toBeEnabled();
    await expect(field).toHaveValue("K7Q42M");
  });

  test("[J3][P1-16] an expired code offers New code, readable on the obsidian card (axe), and it gives another code", async ({
    page,
    signInAs,
  }) => {
    // P1-D close QA MAJOR: the ghost "New code" was ink on obsidian (1.05:1). The guard's axe pass at the end of
    // the test checks the expired state's contrast.
    test.setTimeout(90_000);
    await page.clock.install();
    const me = await signInAs("customer");
    const { shopId } = await seedReward(page.request, me.userId);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/vault/${shopId}`);
    await page
      .getByTestId("vault-rewards")
      .getByTestId("reward-ready")
      .first()
      .getByTestId("reward-redeem")
      .click();
    const sheet = page.getByTestId("redeem-sheet");
    await sheet.getByTestId("redeem-button").click();
    const first = await shownCode(page);
    await page.clock.fastForward("15:05");
    const again = sheet.getByTestId("redeem-new-code");
    await expect(again).toBeVisible();
    await expect(sheet.getByRole("timer")).toHaveAttribute("aria-label", "Code expired");
    const contrast = await again.evaluate((el) => {
      const lum = (c: string): number => {
        const [r, g, b] = (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
          const x = Number(v) / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
      };
      const fg = lum(getComputedStyle(el).color);
      const bg = lum(
        getComputedStyle(el.closest(".m-reward-card") ?? document.body).backgroundColor,
      );
      return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    });
    expect(contrast, "New code on the obsidian card").toBeGreaterThanOrEqual(4.5);
    await again.click();
    await page.clock.runFor(1_000);
    const second = await shownCode(page);
    expect(second).not.toBe(first);
  });
});

test("[J3][P1-18] a session that ended mid-action: Redeem and the team's Confirm offer Sign in back to the page", async ({
  page,
  signInAs,
  browser,
  baseURL,
}) => {
  // P1-D close QA MINOR 4: "Please sign in to continue." had no way on.
  const me = await signInAs("customer");
  const { shopId } = await seedReward(page.request, me.userId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/vault/${shopId}`);
  const list = page.getByTestId("vault-rewards").getByTestId("reward-ready");
  await expect(list).toHaveCount(4);
  await list.first().getByTestId("reward-redeem").click();
  const sheet = page.getByTestId("redeem-sheet");
  await expect(sheet).toBeVisible();
  await page.context().clearCookies();
  await sheet.getByTestId("redeem-button").click();
  await expect(sheet.getByTestId("redeem-error")).toContainText("Please sign in to continue.", {
    timeout: SERVER_MS,
  });
  const back = sheet.getByTestId("redeem-sign-in");
  await expect(back).toHaveAttribute(
    "href",
    `/sign-in?returnTo=${encodeURIComponent(`/vault/${shopId}`)}`,
  );

  const staff = await device(browser, baseURL ?? "", { role: "staff", shopId });
  try {
    await staff.page.goto("/dashboard/requests");
    // The stream must be up before the session goes: one that first connects signed out refreshes the page,
    // whose gate then (rightly) redirects to sign-in and the Confirm field is gone (CI 45952507494, KI-82).
    await expect(staff.page.getByTestId("shop-realtime")).toHaveAttribute("data-realtime", "open", {
      timeout: SERVER_MS,
    });
    await staff.context.clearCookies();
    await confirm(staff.page, "ABCDEF");
    const again = staff.page.getByTestId("redeem-confirm-sign-in");
    await expect(again).toBeVisible({ timeout: SERVER_MS });
    await expect(again).toHaveAttribute(
      "href",
      `/staff/sign-in?returnTo=${encodeURIComponent("/dashboard/requests")}`,
    );
    await again.click();
    await expect(staff.page).toHaveURL(/\/staff\/sign-in\?returnTo=%2Fdashboard%2Frequests$/);
  } finally {
    await staff.context.close();
  }
});

test("[J3][P1-18] two tabs: back on the first tab after a Redeem in the second, its old code is dead (New code)", async ({
  page,
  signInAs,
}) => {
  // P1-D close QA MINOR 3: a newer code voids the old one with no realtime hint; the old tab asks again when
  // it is shown.
  const me = await signInAs("customer");
  const { shopId } = await seedReward(page.request, me.userId);
  const open = async (tab: Page): Promise<Locator> => {
    await tab.setViewportSize({ width: 390, height: 844 });
    await tab.goto(`/vault/${shopId}`);
    const list = tab.getByTestId("vault-rewards").getByTestId("reward-ready");
    await expect(list).toHaveCount(4);
    await list.first().getByTestId("reward-redeem").click();
    const sheet = tab.getByTestId("redeem-sheet");
    await sheet.getByTestId("redeem-button").click();
    await shownCode(tab);
    return sheet;
  };
  const first = await open(page);
  const tabB = await page.context().newPage();
  try {
    await open(tabB);
    await page.bringToFront();
    // Headless pages stay "visible", so the browser's own event is raised the way a tab switch raises it.
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(first.getByTestId("redeem-new-code")).toBeVisible({ timeout: SERVER_MS });
  } finally {
    await tabB.close();
  }
});

test.describe("[P1-18] the redeem sheet's chunk on a slow line", () => {
  // The failed load below is on purpose. How each engine reports a chunk the route aborts: Chromium's failed
  // request and its console echo, WebKit's "Blocked by Web Inspector". Static chunks only; nothing else may fail.
  // One pattern: Playwright reads a two-item array in `test.use` as [value, options] (portal-shells.spec).
  test.use({
    guardAllow: [
      /^(?:requestfailed: GET \S+\/_next\/static\/chunks\/\S+\.js (?:net::ERR_FAILED|Blocked by Web Inspector)|console: Failed to load resource: net::ERR_FAILED)$/,
    ],
  });

  test("[J3][P1-18] Redeem before the sheet's chunk arrives shows the row busy; a failed load says so and a retry opens it", async ({
    page,
    signInAs,
  }) => {
    // P1-D close QA MINOR 5: on slow 3G Redeem gave no feedback for 4–5 s while the sheet's chunk loaded. The
    // chunk names are hashed, so it is told apart by what it holds (only RedeemSheet renders "redeem-sheet").
    test.setTimeout(90_000);
    const me = await signInAs("customer");
    const { shopId } = await seedReward(page.request, me.userId);
    let mode: "pass" | "hold" | "fail" = "hold";
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sheetFetches = 0;
    await page.route("**/_next/static/chunks/*.js", async (route) => {
      const res = await route.fetch();
      const body = await res.text();
      if (!body.includes("redeem-sheet")) return route.fulfill({ response: res, body });
      sheetFetches += 1;
      if (mode === "fail") return route.abort("failed");
      if (mode === "hold") await held;
      return route.fulfill({ response: res, body });
    });

    // Held: the idle preload asked for it, and a press waits on the same load with the row busy.
    await page.goto(`/vault/${shopId}`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const redeem = page.getByTestId("vault-rewards").getByTestId("reward-redeem").first();
    await expect(redeem).toBeVisible();
    await expect.poll(() => sheetFetches, { message: "fetched at idle, before any press" }).toBe(1);
    await redeem.click();
    await expect(redeem).toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("redeem-sheet")).toHaveCount(0);
    release();
    await expect(page.getByTestId("redeem-sheet")).toBeVisible();
    await expect(redeem).not.toHaveAttribute("aria-busy");

    // Failing: the idle preload fails quietly; a press asks again, fails, and says so; the row is not left busy.
    mode = "fail";
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const again = page.getByTestId("vault-rewards").getByTestId("reward-redeem").first();
    await expect.poll(() => sheetFetches).toBeGreaterThanOrEqual(2);
    await again.click();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText("Couldn’t open the reward just now. Check your connection and try again."),
    ).toBeVisible();
    await expect(again).not.toHaveAttribute("aria-busy");
    await expect(page.getByTestId("redeem-sheet")).toHaveCount(0);

    // Back online: the next press loads it and the sheet opens.
    mode = "pass";
    await again.click();
    await expect(page.getByTestId("redeem-sheet")).toBeVisible();
  });
});
