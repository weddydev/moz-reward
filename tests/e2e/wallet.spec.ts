import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test, testApiHeaders } from "./support/test";
import { vtName } from "../../src/lib/motion/route-transitions";

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
    /** P1-12: approved visits through the approvals service (needs a programme). */
    visits?: number;
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

/** Typed View Transitions available (Chromium today); elsewhere navigation runs without the morph. */
const typedVt = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      typeof document.startViewTransition === "function" &&
      "types" in
        ((window as unknown as { ViewTransition?: { prototype: object } }).ViewTransition
          ?.prototype ?? {}),
  );

/**
 * Records the names of `::view-transition-group(...)` pseudos seen in any frame for 4 s from now (the same
 * sampling as motion.spec's recorder, names only). Read back with `vtGroups`.
 */
async function recordVtGroups(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __vtGroups: Record<string, 1> };
    w.__vtGroups = {};
    const until = performance.now() + 4000;
    const tick = (): void => {
      if (performance.now() < until) requestAnimationFrame(tick);
      for (const a of document.getAnimations()) {
        const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
        const name = /^::view-transition-group\(([^)]+)\)/.exec(pseudo)?.[1];
        if (name) w.__vtGroups[name] = 1;
      }
    };
    requestAnimationFrame(tick);
  });
}
const vtGroups = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Object.keys((window as unknown as { __vtGroups: Record<string, 1> }).__vtGroups),
  );

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
    els.map((el) => el.querySelector(".m-wc-name")?.textContent ?? ""),
  );
  expect(names).toEqual(["Brew & Bloom Café", LONG_NAME, "Corner Grocer", "Paused Barber"]);

  const first = cards(page).first();
  await expect(first).toHaveAttribute("href", `/shops/${brew.shopId}`);
  // The meta line is the reference's `.wc-meta` (gold of the ingot · its reward); the percent and the visits
  // hint are in the accessible name (P1-B close design review).
  await expect(first.locator(".m-wc-meta")).toHaveText("720 / 1,000 · Free drink of your choice");
  await expect(first.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
  await expect(first).toHaveAttribute(
    "aria-label",
    /720 \/ 1,000 gold, Free drink of your choice, 72%/,
  );
  await expect(cards(page).nth(1).locator(".m-wc-meta")).toHaveText(
    "500 / 1,000 · Free drink of your choice",
  );
  await expect(cards(page).nth(2)).toContainText("Rewards not set up yet");
  const paused = cards(page).nth(3);
  await expect(paused).toHaveAttribute("data-availability", "suspended");
  await expect(paused).toContainText("Taking a break");

  await expect(page.getByTestId("summary-ingots")).toContainText("4");
  await expect(page.getByTestId("summary-ingots")).toContainText("Ingots filled");
  await expect(page.getByTestId("summary-rewards")).toContainText("0");
  // The total panel: the gold the cards show (Corner Grocer has no programme), across every shop.
  await expect(page.getByTestId("wallet-total")).toHaveText("1,320gold across 4 shops");

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await noHorizontalScroll(page);
    // The long name stays within its card (one line with an ellipsis, PD-08).
    const nameBox = await cards(page).nth(1).locator(".m-wc-name").boundingBox();
    const cardBox = await cards(page).nth(1).boundingBox();
    expect(nameBox && cardBox && nameBox.x + nameBox.width <= cardBox.x + cardBox.width + 0.5).toBe(
      true,
    );
    // The meta line keeps its words; an opening-hours pill that doesn't fit wraps under it (P1-B close QA).
    expect(
      await first.locator(".m-wc-meta").evaluate((el) => el.scrollWidth <= el.clientWidth),
      `meta line whole at ${String(width)}`,
    ).toBe(true);
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

  // A card opens the shop page. The page's data is held back 800 ms, as on a phone network: the loading state
  // commits first and already carries the card's logo and name (hero handoff), so the gold wipe opens onto them.
  // No shared-element morph forms (PD-08: the wipe replaces it; a morph layer would paint over the metal and the
  // dock outside the circle): no shop logo/name view-transition group at all.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**/shops/${brew.shopId}*`, async (route) => {
    const headers = route.request().headers();
    if (!headers["next-router-prefetch"]) await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  const morphs = await typedVt(page);
  if (morphs) await recordVtGroups(page);
  // On a phone the first card is at the back of its stack: tap its header strip (PD-08), as a thumb would.
  await first.click({ position: { x: 60, y: 24 } });
  await expect(page.getByTestId("member-shop-name-loading")).toHaveText("Brew & Bloom Café");
  await expect(page).toHaveURL(`/shops/${brew.shopId}`);
  await expect(page.getByTestId("member-shop-name")).toHaveText("Brew & Bloom Café");
  await expect(page.getByTestId("member-shop-name-loading")).toHaveCount(0);
  if (morphs) {
    const shopGroups = (await vtGroups(page)).filter((n) => /^vt-shop(logo|name)-/.test(n));
    expect(shopGroups, `no morph pair for ${vtName("shopname", brew.shopId)}`).toEqual([]);
  }
  // The shop opens from the Wallet, so the dock keeps Wallet current (its gold stays put; design review MED).
  const nav = page.locator('[data-portal-nav="bottom"]');
  await expect(nav.getByRole("link", { name: "Wallet" })).toHaveAttribute("aria-current", "page");
  await expect(nav).not.toHaveAttribute("data-empty");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.locator('[data-portal-nav="side"]').getByRole("link", { name: "Wallet" }),
  ).toHaveAttribute("aria-current", "page");
});

test("[P1-12] wallet right column: recent activity and rewards ready from approved visits (C-62)", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  // 800 gold (no milestone recorded yet), then two visits of 100: the first passes the 50% milestone and unlocks
  // "Free pastry", the second fills the ingot and unlocks its main reward: 2 rewards ready.
  await seedMembership(page.request, me.userId, {
    name: "Brew & Bloom Café",
    programme: true,
    member: { purchaseCount: 9, progressGold: 800 },
    visits: 2,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/wallet");
  const activity = page.getByTestId("wallet-activity").getByRole("listitem");
  await expect(activity).toHaveCount(2);
  for (const row of [activity.nth(0), activity.nth(1)]) {
    await expect(row).toContainText("Brew & Bloom Café");
    await expect(row).toContainText("+100 gold");
  }
  await expect(page.getByTestId("wallet-rewards-ready")).toContainText("Rewards ready (2)");
  await expect(page.getByTestId("wallet-rewards-ready")).toContainText("2 rewards waiting");
  await shoot("wallet-activity-1440");
});

test("[PD-08] wallet stack: phones stack cards in threes with their header strips in view; Show all opens the rest; the grid from 768px", async ({
  page,
  signInAs,
  shoot,
}) => {
  const me = await signInAs("customer");
  for (const [i, name] of [
    "Alpha Café",
    "Bravo Bakes",
    "Charlie Cycles",
    "Delta Deli",
    "Echo Eats",
  ].entries())
    await seedMembership(page.request, me.userId, {
      name,
      programme: true,
      member: { purchaseCount: 10 - i, progressGold: 100 * (i + 1) },
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");
  await expect(cards(page)).toHaveCount(5);
  const visible = page.locator('[data-testid="wallet-card"]:visible');
  await expect(visible).toHaveCount(3);
  // Each card overlaps the one before, leaving its 58 px header strip in view (150 px card, −92 px).
  const tops = await visible.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(tops.slice(1).map((t, i) => Math.round(t - (tops[i] ?? 0)))).toEqual([58, 58]);
  // The strip is the card's own: a tap on it lands on that card, not the one in front.
  const strip = await visible.first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.left + 60, r.top + 24)?.closest("a") === el;
  });
  expect(strip).toBe(true);
  await noHorizontalScroll(page);
  await shoot("wallet-stack-390");
  const more = page.getByTestId("wallet-show-all");
  await expect(more).toHaveText("Show all 5 shops");
  await more.click();
  await expect(visible).toHaveCount(5);
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await shoot("wallet-stack-390-all", { fullPage: true });
  await more.click();
  await expect(visible).toHaveCount(3);
  await page.setViewportSize({ width: 320, height: 720 });
  await noHorizontalScroll(page);
  await shoot("wallet-stack-320");
  // From 768px: all five in the grid, side by side, no overlap and no Show all.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(visible).toHaveCount(5);
  await expect(more).toBeHidden();
  const row = await cards(page).evaluateAll((els) =>
    els.slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  expect(new Set(row).size).toBe(1);
  await shoot("wallet-stack-1440");
});

test("[P1-07] wallet header as the reference (P1-B close design review): greeting, placed bell, the gold total under a turning light", async ({
  page,
  signInAs,
}) => {
  const me = await signInAs("customer");
  for (const [name, gold] of [
    ["Camden Bakehouse", 360],
    ["Brew & Bloom Café", 720],
  ] as const) {
    await seedMembership(page.request, me.userId, {
      name,
      programme: true,
      member: { purchaseCount: 3, progressGold: gold },
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");

  // `.w-head`: the time of day small, then the name (or the time of day alone) in Fraunces 34.
  const head = page.getByTestId("wallet-greeting");
  await expect(head).toHaveText(/^Good (morning|afternoon|evening)/);
  const big = head.locator(".m-wname");
  await expect(big).toHaveCSS("font-size", "34px");
  expect(await big.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Fraunces/i);

  // One bell on a phone: the page's 44 px placed bell (the top bar leaves its own out on the Wallet).
  const bell = page.getByTestId("wallet-bell");
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("href", "/notifications");
  await expect(bell).toHaveAccessibleName("Notifications");
  const box = await bell.boundingBox();
  expect([Math.round(box?.width ?? 0), Math.round(box?.height ?? 0)]).toEqual([44, 44]);
  await expect(bell.locator("i")).toHaveCount(0); // no unread count until P3-07 (C-87)
  await expect(page.getByRole("link", { name: "Notifications" })).toHaveCount(1);

  // `.total`: obsidian, the number in the metal shine, the conic light turning every 6 s.
  const total = page.getByTestId("wallet-total");
  await expect(total).toHaveText("1,080gold across 2 shops");
  await expect(total).toHaveCSS("border-radius", "22px");
  const light = await total.evaluate((el) => {
    const cs = getComputedStyle(el, "::before");
    return { name: cs.animationName, duration: cs.animationDuration };
  });
  expect(light).toEqual({ name: "m-spin", duration: "6s" });
  await expect(total.locator(".m-t-num")).toHaveCSS("animation-name", "m-textshine");

  // Off screen the loops sleep.
  const header = page.getByTestId("wallet-header");
  await expect(header).not.toHaveAttribute("data-paused");
  await page.setViewportSize({ width: 390, height: 320 });
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect
    .poll(() => header.evaluate((el) => el.getBoundingClientRect().bottom))
    .toBeLessThan(0);
  await expect(header).toHaveAttribute("data-paused");
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect(header).not.toHaveAttribute("data-paused");

  // Elsewhere the top bar keeps its bell.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/offers");
  await expect(page.getByRole("link", { name: "Notifications" })).toBeVisible();

  // From 768px the rail carries notifications, so the page's bell hides.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/wallet");
  await expect(bell).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Notifications" }).filter({ visible: true }),
  ).toHaveCount(1);

  // Reduced motion: the light and the shine hold still.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect
    .poll(() =>
      total.evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
      ),
    )
    .toBe(0);
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
  // No shops, no "0 gold across 0 shops": the empty state says what to do instead.
  await expect(page.getByTestId("wallet-total")).toHaveCount(0);
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
  // The listeners attach on hydration; a touch before then is (correctly) ignored.
  await expect(indicator).toHaveAttribute("data-listening", "true");
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
