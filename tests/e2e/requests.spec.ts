import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { expect, newClientContext, test, testApiHeaders } from "./support/test";

// P1-12 journey 2 on the production build: a member asks for gold on their phone, the team's Requests queue shows
// it live (the shop stream; `/api/test/relay-realtime` does the worker's publish job, no worker runs in E2E), a
// staff member approves it with items, and the member's shop page updates live with the receipt. A second tab on
// the same request gets "already dealt with" (one receipt). Over the staff limit the award goes to the owner,
// who approves it; a reject needs a preset reason. Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-12).

const NAME = "Aisha Khan"; // makeCustomerProfile's default name

// The queue and the member's page follow their streams (off by default in E2E, tests/e2e/support/test.ts).
test.use({ realtime: true });
/** An approval under 10 parallel workers on a laptop can take seconds (alone: ~0.1 s). */
const DECIDE_MS = 15_000;
const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

async function session(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ userId: string }> {
  const res = await request.post("/api/test/session", { data, headers: testApiHeaders() });
  expect(res.status(), "test session").toBe(200);
  return (await res.json()) as { userId: string };
}

/** A shop with the sample programme (+100 gold a visit) and the customer as a member with 5 visits. */
async function seedShop(request: APIRequestContext, userId: string): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: "Brew & Bloom Café",
      details: true,
      programme: "sample",
      memberUserId: userId,
      member: { purchaseCount: 5, progressGold: 720, lastVisitDaysAgo: 3 },
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

/** What the worker's publish job does with the shop's queued realtime hints. */
async function relay(request: APIRequestContext, shopId: string): Promise<number> {
  const res = await request.post("/api/test/relay-realtime", {
    data: { shopId },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { delivered: number }).delivered;
}

/** Another device, signed in: the member's phone, or a second team member. */
async function device(
  browser: Browser,
  baseURL: string,
  data: Record<string, unknown>,
): Promise<{ context: BrowserContext; page: Page; userId: string }> {
  const context = await newClientContext(browser, baseURL);
  const { userId } = await session(context.request, data);
  return { context, page: await context.newPage(), userId };
}

/** The member opens the shop page with its stream open and taps "Request points". */
async function askForGold(member: Page, shopId: string): Promise<void> {
  await member.goto(`/shops/${shopId}`);
  await expect(member.getByTestId("realtime")).toHaveAttribute("data-realtime", "open");
  await member.getByTestId("request-points").click();
  await expect(member.getByTestId("request-pending")).toBeVisible();
}

async function openQueue(page: Page, tab?: "awaiting"): Promise<void> {
  await page.goto(tab ? `/dashboard/requests?tab=${tab}` : "/dashboard/requests");
  await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
  await expect(page.getByTestId("shop-realtime")).toHaveAttribute("data-realtime", "open");
}

/** P2-02: the Requests page's tabs change the URL; the board follows once the server answers. */
async function openTab(page: Page, name: string, tab: string): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByTestId("requests-board")).toHaveAttribute("data-tab", tab);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P1-12] J2: a request reaches the team live; staff approve it with items; the member sees the receipt live", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  // Two devices, several loads and three resizes: Linux WebKit can draw no frame for seconds after each (KI-10).
  test.setTimeout(120_000);
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    await signInAs("staff", { shopId });
    await openQueue(page);
    await expect(page.getByTestId("requests-empty")).toContainText("No open requests");

    await askForGold(member.page, shopId);
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    // No reload: the shop stream's hint refreshed the queue.
    const row = page.getByTestId("request-row");
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("request-name")).toHaveText(NAME);
    await expect(row.getByTestId("request-member-id")).toHaveText(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/);
    await expect(row).toContainText("5 visits");
    await expect(row).toContainText(/Last visit \d{1,2} [A-Z][a-z]{2} \d{4}/);
    await expect(row).toHaveAttribute("data-status", "pending");

    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noHorizontalScroll(page);
      await shoot(`requests-queue-${String(width)}`);
    }

    await row.getByRole("button", { name: `Approve ${NAME}` }).click();
    const form = page.getByTestId("approve-form");
    await expect(form).toBeVisible();
    // The sample programme gives gold per visit: the amount is optional.
    await expect(form.getByLabel("Amount spent (£)")).not.toHaveAttribute("required", "");
    await form.getByLabel("Items (optional)").fill("Flat white, Croissant");
    await shoot("requests-approve-1440", { fullPage: false });
    await form.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +100 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
    await expect(page.getByTestId("requests-empty")).toBeVisible();
    await expect(page.getByTestId("request-row")).toHaveCount(0);

    // The member's phone: the pending state goes and the receipt shows, without a reload.
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    await expect(member.page.getByTestId("request-pending")).toHaveCount(0);
    const receipts = member.page
      .getByTestId("shop-receipts")
      .getByRole("list", { name: "Recent receipts" })
      .getByRole("listitem");
    await expect(receipts).toHaveCount(1);
    await expect(receipts.first()).toContainText("Receipt 1");
    await expect(receipts.first()).toContainText("+100 gold");
    await expect(receipts.first()).toContainText("Flat white, Croissant");
  } finally {
    await member.context.close();
  }
});

test("[P1-12] two tabs approve the same request: one receipt; the stale tab is told it was dealt with", async ({
  page,
  browser,
  baseURL,
  signInAs,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    await askForGold(member.page, shopId);
    await signInAs("staff", { shopId });
    const second = await page.context().newPage();
    await second.setViewportSize({ width: 1440, height: 900 });
    for (const tab of [page, second]) {
      await openQueue(tab);
      await expect(tab.getByTestId("request-row")).toHaveCount(1);
      await tab.getByRole("button", { name: `Approve ${NAME}` }).click();
      await expect(tab.getByTestId("approve-form")).toBeVisible();
    }

    await page.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +100 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
    // The second tab never got the hint (no relay): its approve reaches the server and is refused.
    await second.getByTestId("approve-submit").click();
    await expect(toasts(second)).toContainText("This request has already been dealt with.");
    await expect(second.getByTestId("approve-form")).toHaveCount(0);
    await expect(second.getByTestId("requests-empty")).toBeVisible();

    await member.page.reload();
    await expect(
      member.page
        .getByTestId("shop-receipts")
        .getByRole("list", { name: "Recent receipts" })
        .getByRole("listitem"),
    ).toHaveCount(1);
  } finally {
    await member.context.close();
  }
});

test("[P1-12] over the staff limit the owner approves; a reject needs a preset reason", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    // A staff member who may award at most 50 gold at once; a visit earns 100.
    await signInAs("staff", { shopId, perAwardLimit: 50 });
    await askForGold(member.page, shopId);
    await openQueue(page);
    await page.getByRole("button", { name: `Approve ${NAME}` }).click();
    await page.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(
      "+100 gold is over your limit, so the owner will approve it.",
    );
    // P2-02: the request leaves Pending for the Awaiting owner tab.
    await expect(page.getByTestId("requests-empty")).toBeVisible();
    await openTab(page, "Awaiting owner", "awaiting");
    const row = page.getByTestId("request-row");
    await expect(row).toHaveAttribute("data-status", "awaiting_owner");
    await expect(row).toContainText("Needs the owner");
    await expect(row.getByTestId("request-waiting")).toHaveText(
      "Waiting for the owner to approve +100 gold",
    );
    await expect(row.getByRole("button", { name: `Approve ${NAME}` })).toHaveCount(0);
    await noHorizontalScroll(page);
    await shoot("requests-waiting-for-owner-390");

    const owner = await device(browser, baseURL ?? "", { role: "owner", shopId });
    try {
      await openQueue(owner.page, "awaiting");
      const ownerRow = owner.page.getByTestId("request-row");
      await expect(ownerRow.getByTestId("request-proposal")).toHaveText("Proposed: +100 gold");
      await ownerRow.getByRole("button", { name: `Approve ${NAME}` }).click();
      const form = owner.page.getByTestId("approve-form");
      await expect(form.getByTestId("approve-proposal")).toContainText(
        "Your team proposed +100 gold",
      );
      await form.getByTestId("approve-submit").click();
      await expect(toasts(owner.page)).toContainText(
        `Approved: +100 gold for ${NAME}. Receipt 1.`,
        {
          timeout: DECIDE_MS,
        },
      );
      await expect(owner.page.getByTestId("requests-empty")).toBeVisible();
    } finally {
      await owner.context.close();
    }
    // The owner's decision reaches the staff queue through the shop stream.
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId("requests-empty")).toBeVisible();

    // A second visit, rejected: the reason is required, the note stays with the team.
    await openTab(page, "Pending", "pending");
    await askForGold(member.page, shopId);
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    await page.getByRole("button", { name: `Reject ${NAME}` }).click();
    const reject = page.getByTestId("reject-form");
    await reject.getByTestId("reject-submit").click();
    await expect(reject).toContainText("Choose a reason.");
    await reject.getByRole("radio", { name: "No purchase made" }).check();
    await reject.getByLabel("Note (optional)").fill("Card declined at the till");
    await shoot("requests-reject-390", { fullPage: false });
    await reject.getByTestId("reject-submit").click();
    await expect(toasts(page)).toContainText(`Request from ${NAME} rejected.`);
    await expect(page.getByTestId("requests-empty")).toBeVisible();

    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    await expect(member.page.getByTestId("request-pending")).toHaveCount(0);
  } finally {
    await member.context.close();
  }
});

test("[P1-12] the owner's Requests nav counts the requests awaiting them, live; staff see no count (code review M3)", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    // The owner waits on the dashboard home (not the Requests page): the count is how they find out.
    await signInAs("owner", { shopId });
    await page.goto("/dashboard");
    await expect(page.getByTestId("shop-realtime")).toHaveAttribute("data-realtime", "open");
    const dock = page.locator('[data-portal-nav="bottom"]');
    await expect(dock.getByRole("link", { name: "Requests", exact: true })).toBeVisible();
    await expect(page.getByTestId("nav-count")).toHaveCount(0);

    // A staff member who may award at most 50 gold sends a 100-gold visit to the owner.
    const staff = await device(browser, baseURL ?? "", {
      role: "staff",
      shopId,
      perAwardLimit: 50,
    });
    try {
      await staff.page.setViewportSize({ width: 390, height: 844 });
      await askForGold(member.page, shopId);
      await openQueue(staff.page);
      await staff.page.getByRole("button", { name: `Approve ${NAME}` }).click();
      await staff.page.getByTestId("approve-submit").click();
      // P2-02: routed to the owner, it leaves the Pending tab.
      await expect(toasts(staff.page)).toContainText(
        "+100 gold is over your limit, so the owner will approve it.",
        { timeout: DECIDE_MS },
      );
      await expect(staff.page.getByTestId("requests-empty")).toBeVisible();
      expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
      // Staff can't approve it, so their nav shows no count.
      await expect(staff.page.getByTestId("nav-count")).toHaveCount(0);
    } finally {
      await staff.context.close();
    }

    const item = dock.getByRole("link", { name: "Requests (1 awaiting you)" });
    await expect(item).toBeVisible();
    await expect(item.getByTestId("nav-count")).toHaveText("1");
    await noHorizontalScroll(page);
    await shoot("requests-owner-count-390", { fullPage: false });
    await page.setViewportSize({ width: 320, height: 700 });
    await noHorizontalScroll(page);
    await shoot("requests-owner-count-320", { fullPage: false });
    await page.setViewportSize({ width: 1440, height: 900 });
    const side = page.locator('[data-portal-nav="side"]');
    await expect(side.getByRole("link", { name: "Requests (1 awaiting you)" })).toBeVisible();
    await shoot("requests-owner-count-1440", { fullPage: false });

    // The owner approves it: the count goes. P2-02: the item opens the Awaiting owner tab.
    await side.getByRole("link", { name: "Requests (1 awaiting you)" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
    await expect(page.getByTestId("requests-board")).toHaveAttribute("data-tab", "awaiting");
    await page.getByRole("button", { name: `Approve ${NAME}` }).click();
    await page.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +100 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
    await relay(page.request, shopId);
    await expect(page.getByTestId("nav-count")).toHaveCount(0);
  } finally {
    await member.context.close();
  }
});

/** P2-02: a shop giving 2 gold per £1, with quick-picks, and the customer as a member (5 visits). */
async function seedPerPoundShop(
  request: APIRequestContext,
  userId: string,
): Promise<{ shopId: string }> {
  const res = await request.post("/api/test/shop", {
    data: {
      status: "active",
      name: "Brew & Bloom Café",
      details: true,
      programme: "per_pound",
      memberUserId: userId,
      member: { purchaseCount: 5, progressGold: 120, lastVisitDaysAgo: 3 },
      quickPicks: [
        { label: "Flat white", pricePence: 340 },
        { label: "Croissant", pricePence: 295 },
        { label: "Loyalty stamp", pricePence: null },
      ],
    },
    headers: testApiHeaders(),
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string };
}

test("[P2-02] Requests tabs: a live arrival slides in, quick-picks and the live gold preview, then Approved today", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedPerPoundShop(page.request, member.userId);
    await signInAs("owner", { shopId });
    await openQueue(page);
    await expect(page.getByTestId("requests-board")).toHaveAttribute("data-tab", "pending");
    await expect(page.getByRole("tab", { name: /^Pending/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("requests-empty")).toContainText("No open requests");

    await askForGold(member.page, shopId);
    expect(await relay(page.request, shopId)).toBeGreaterThanOrEqual(1);
    const row = page.getByTestId("request-row");
    await expect(row).toHaveCount(1);
    // DESIGN §8.7: it arrived while the page was open, so it slides in with the gold highlight.
    await expect(row).toHaveAttribute("data-arrived", "");
    await expect(page.getByRole("tab", { name: /^Pending/ })).toContainText("1");

    await row.getByRole("button", { name: `Approve ${NAME}` }).click();
    const form = page.getByTestId("approve-form");
    await expect(form).toBeVisible();
    await expect(form.getByTestId("approve-pad")).toHaveCount(0); // desktop: a text field
    const amount = form.getByLabel("Amount spent (£)");
    await expect(amount).toHaveAttribute("required", "");
    await expect(form.getByTestId("approve-gold")).toHaveAttribute("data-kind", "needs-amount");

    // A quick-pick adds the item and its price; two add up; the gold follows (2 per £1, rounded down).
    await form.getByRole("button", { name: "Flat white £3.40" }).click();
    await expect(amount).toHaveValue("3.40");
    await expect(form.getByTestId("approve-gold-value")).toHaveText("+6 gold");
    await form.getByRole("button", { name: "Croissant £2.95" }).click();
    await expect(amount).toHaveValue("6.35");
    await expect(form.getByTestId("approve-gold-value")).toHaveText("+12 gold");

    // A typed amount wins over the picks from then on.
    await amount.fill("42");
    await expect(form.getByTestId("approve-gold-value")).toHaveText("+84 gold");
    await form.getByRole("button", { name: "Loyalty stamp" }).click();
    await expect(amount).toHaveValue("42");
    await expect(form.getByTestId("approve-submit")).toHaveText("Confirm and issue +84 gold");
    await shoot("requests-approve-panel-1440", { fullPage: false });

    await form.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +84 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
    await expect(page.getByTestId("requests-empty")).toBeVisible();

    await openTab(page, "Approved today", "approved");
    await expect(page).toHaveURL(/\?tab=approved$/);
    const done = page.getByTestId("request-row");
    await expect(done).toHaveCount(1);
    await expect(done).toHaveAttribute("data-status", "approved");
    await expect(done.getByTestId("request-outcome")).toHaveText(/^\+84 gold at \d{2}:\d{2}$/);
    await expect(page.getByRole("tab", { name: /^Approved today/ })).toContainText("1");
    await shoot("requests-approved-today-1440");

    await openTab(page, "Expired", "expired");
    await expect(page.getByTestId("requests-empty")).toContainText("No expired requests");
  } finally {
    await member.context.close();
  }
});

test("[P2-02] on a phone Approve opens a number pad; the amount and gold follow the keys", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const member = await device(browser, baseURL ?? "", { role: "customer" });
  try {
    const { shopId } = await seedPerPoundShop(page.request, member.userId);
    await signInAs("staff", { shopId });
    await askForGold(member.page, shopId);
    await openQueue(page);
    await page.getByRole("button", { name: `Approve ${NAME}` }).click();
    const form = page.getByTestId("approve-form");
    const pad = form.getByTestId("approve-pad");
    await expect(pad).toBeVisible();
    const amount = form.getByLabel("Amount spent (£)");
    await expect(amount).toHaveAttribute("inputmode", "none");

    for (const key of ["1", "2", "Decimal point", "5", "0", "9"]) {
      await pad.getByRole("button", { name: key, exact: true }).click();
    }
    await expect(amount).toHaveValue("12.50"); // a third decimal is ignored
    await expect(form.getByTestId("approve-gold-value")).toHaveText("+25 gold");
    await pad.getByRole("button", { name: "Delete" }).click();
    await expect(amount).toHaveValue("12.5");
    await expect(form.getByTestId("approve-submit")).toHaveText("Confirm and issue +25 gold");
    await noHorizontalScroll(page);
    await shoot("requests-number-pad-390", { fullPage: false });
    await page.setViewportSize({ width: 320, height: 640 });
    await noHorizontalScroll(page);
    await shoot("requests-number-pad-320", { fullPage: false });

    await form.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +25 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
  } finally {
    await member.context.close();
  }
});
