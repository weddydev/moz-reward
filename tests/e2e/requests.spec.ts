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

async function openQueue(page: Page): Promise<void> {
  await page.goto("/dashboard/requests");
  await expect(page.getByRole("heading", { level: 1, name: "Requests" })).toBeVisible();
  await expect(page.getByTestId("shop-realtime")).toHaveAttribute("data-realtime", "open");
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
      await openQueue(owner.page);
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
