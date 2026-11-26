import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
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
  await expect(digits).toHaveAttribute("aria-label", /^Redeem code( [2-9A-HJKMNP-TV-Z]){6}$/);
  const label = (await digits.getAttribute("aria-label")) ?? "";
  const code = label.replace("Redeem code", "").replace(/\s/g, "");
  expect(code).toMatch(CODE);
  return code;
}

async function confirm(staff: Page, code: string): Promise<void> {
  await staff.getByTestId("redeem-confirm-code").fill(code);
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
    await sheet.getByTestId("redeem-button").click();
    const code = await shownCode(member.page);
    await expect(sheet.getByRole("timer")).toHaveAttribute(
      "aria-label",
      /^Code expires in 1[45]:\d\d$/,
    );
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
    await expect(ready).toContainText("Rewards ready (4)");
    const rows = ready.getByTestId("reward-ready");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText(SHOP);
    await expect(rows.first()).toContainText(/Valid until/);
    await shootOn(member.page, "wallet-rewards-1440");

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
