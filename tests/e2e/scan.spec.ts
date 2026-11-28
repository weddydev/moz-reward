import QRCode from "qrcode";
import { expect, newClientContext, test, testApiHeaders } from "./support/test";
import type { APIRequestContext, Browser, BrowserContext, Page } from "@playwright/test";

// P2-02 journey 4 (TESTING §2) on the production build: staff scan a customer's member QR at the counter and
// award gold directly. The camera is mocked: `getUserMedia` returns a canvas stream that draws whatever QR the
// test shows it, so the real decoder reads real frames. Without `BarcodeDetector` the jsQR worker decodes
// (Safari, Firefox); with it (a stub here, so every engine runs the path) no worker is ever created. Forged,
// expired and shop QRs are refused; a denied camera leaves manual member-ID entry; a member with a request
// waiting is sent to it. Screenshots at 390, 320 and 1440 (.artifacts/screens/P2-02).

const NAME = "Aisha Khan"; // makeCustomerProfile's default name
const DECIDE_MS = 15_000;
/** Steps that wait on drawn camera frames: CI's Linux WebKit can draw none for seconds (KI-10, KI-95). */
const FRAMES_MS = 15_000;
const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

type Camera = { decoder: "worker" | "native"; deny?: boolean };

/**
 * The mocked camera, before any page script runs. `window.__scanImage` (a QR as a data URL) is drawn on a white
 * canvas 20 times a second; the stream is that canvas. With `native`, a stub `BarcodeDetector` answers
 * `window.__scanText` instead, so the native path runs on every engine without a real detector.
 */
async function fakeCamera(page: Page, camera: Camera): Promise<void> {
  await page.addInitScript(({ decoder, deny }) => {
    const w = window as unknown as {
      __scanImage: string | null;
      __scanText: string | null;
      BarcodeDetector?: unknown;
    };
    w.__scanImage = null;
    w.__scanText = null;
    if (decoder === "native") {
      w.BarcodeDetector = class {
        static getSupportedFormats(): Promise<string[]> {
          return Promise.resolve(["qr_code"]);
        }
        detect(): Promise<{ rawValue: string }[]> {
          return Promise.resolve(w.__scanText ? [{ rawValue: w.__scanText }] : []);
        }
      };
    } else {
      delete w.BarcodeDetector;
      w.BarcodeDetector = undefined;
    }
    // On the prototype: WebKit replaces `navigator.mediaDevices` after the init script, dropping an own property.
    const getUserMedia = (): Promise<MediaStream> => {
      if (deny) return Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const g = canvas.getContext("2d");
      const img = new Image();
      let shown: string | null = null;
      setInterval(() => {
        if (!g) return;
        g.fillStyle = "white";
        g.fillRect(0, 0, 640, 480);
        if (w.__scanImage !== shown) {
          shown = w.__scanImage;
          if (shown) img.src = shown;
        }
        if (shown && img.complete) g.drawImage(img, 170, 90, 300, 300);
      }, 50);
      return Promise.resolve(canvas.captureStream(20));
    };
    Object.defineProperty(MediaDevices.prototype, "getUserMedia", {
      value: getUserMedia,
      configurable: true,
      writable: true,
    });
  }, camera);
}

/** Show the camera a QR of `text` (worker path: a real image; native stub: the text itself). */
async function showQr(page: Page, text: string | null): Promise<void> {
  const image = text ? await QRCode.toDataURL(text, { margin: 4, width: 300 }) : null;
  await page.evaluate(
    ([img, txt]) => {
      const w = window as unknown as { __scanImage: string | null; __scanText: string | null };
      w.__scanImage = img;
      w.__scanText = txt;
    },
    [image, text] as const,
  );
}

async function session(
  request: APIRequestContext,
  data: Record<string, unknown>,
): Promise<{ userId: string }> {
  const res = await request.post("/api/test/session", { data, headers: testApiHeaders() });
  expect(res.status(), "test session").toBe(200);
  return (await res.json()) as { userId: string };
}

/** The customer's phone, signed in, with their live member-QR token and member ID. */
async function customer(
  browser: Browser,
  baseURL: string,
): Promise<{
  context: BrowserContext;
  userId: string;
  card: () => Promise<{ token: string; memberId: string }>;
}> {
  const context = await newClientContext(browser, baseURL);
  const { userId } = await session(context.request, { role: "customer" });
  const card = async (): Promise<{ token: string; memberId: string }> => {
    const res = await context.request.get("/api/me/member-qr");
    expect(res.status(), "member qr").toBe(200);
    return (await res.json()) as { token: string; memberId: string };
  };
  return { context, userId, card };
}

/** A shop with the sample programme (+100 gold a visit); the customer a member with 5 visits. */
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

async function openScanner(page: Page): Promise<void> {
  await page.goto("/dashboard/scan");
  await expect(page.getByRole("heading", { level: 1, name: "Scan" })).toBeVisible();
}

async function startCamera(page: Page): Promise<void> {
  await page.getByTestId("scanner-start").click();
  await expect(page.getByTestId("scanner-view")).toHaveAttribute("data-state", "live", {
    timeout: FRAMES_MS,
  });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("[P2-02] J4: staff scan a member QR (jsQR worker), award gold, and the same QR can't award twice", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(120_000);
  const member = await customer(browser, baseURL ?? "");
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    const workers: string[] = [];
    page.on("worker", (w) => workers.push(w.url()));
    await fakeCamera(page, { decoder: "worker" });
    await signInAs("staff", { shopId });
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto("/dashboard/scan");
    // The camera is allowed on this page only (SECURITY §5).
    expect(res?.headers()["permissions-policy"]).toContain("camera=(self)");
    await expect(page.getByTestId("scanner-explainer")).toContainText(
      "The picture stays on this device",
    );
    // The decoder loads only once the camera starts (and only because BarcodeDetector is missing).
    expect(workers).toEqual([]);
    for (const width of [390, 320, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await noHorizontalScroll(page);
      await shoot(`scan-idle-${String(width)}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    await startCamera(page);
    await expect(page.getByTestId("scanner-view")).toHaveAttribute("data-decoder", "worker");
    await expect.poll(() => workers.length).toBe(1);
    // A canvas stream has no torch: the toggle stays hidden.
    await expect(page.getByTestId("scanner-torch")).toHaveCount(0);

    const { token } = await member.card();
    await showQr(page, token);
    const form = page.getByTestId("approve-form");
    await expect(form).toBeVisible({ timeout: FRAMES_MS });
    const dialog = page.getByRole("dialog", { name: "Award gold" });
    await expect(dialog).toContainText(NAME);
    await expect(form.getByTestId("approve-member")).toContainText("5 visits");
    // Phones get the number pad; the live gold comes from the engine (+100 a visit).
    await expect(form.getByTestId("approve-pad")).toBeVisible();
    await expect(form.getByTestId("approve-gold-value")).toHaveText("+100 gold");
    await noHorizontalScroll(page);
    await shoot("scan-award-390", { fullPage: false });
    await page.setViewportSize({ width: 320, height: 700 });
    await shoot("scan-award-320", { fullPage: false });
    await form.getByTestId("approve-submit").click();
    await expect(toasts(page)).toContainText(`Approved: +100 gold for ${NAME}. Receipt 1.`, {
      timeout: DECIDE_MS,
    });
    await expect(form).toHaveCount(0);

    // Still in front of the camera: it never reopens the panel.
    await expect(page.getByTestId("scanner-message")).toContainText("Gold was just awarded", {
      timeout: FRAMES_MS,
    });
    await expect(page.getByTestId("approve-form")).toHaveCount(0);

    // The award is a scan request, already approved, on today's tab.
    // Let the award's page refresh finish first: a navigation cutting it off is a WebKit "Load failed" page error.
    await page.waitForLoadState("networkidle");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/requests?tab=approved");
    const row = page.getByTestId("request-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(NAME);
    await expect(row).toContainText("+100 gold");
  } finally {
    await member.context.close();
  }
});

test("[P2-02] J4: with BarcodeDetector no worker loads; shop, forged and expired QRs are refused clearly", async ({
  page,
  browser,
  baseURL,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  const member = await customer(browser, baseURL ?? "");
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    const workers: string[] = [];
    page.on("worker", (w) => workers.push(w.url()));
    await fakeCamera(page, { decoder: "native" });
    await signInAs("staff", { shopId });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openScanner(page);
    await startCamera(page);
    await expect(page.getByTestId("scanner-view")).toHaveAttribute("data-decoder", "native");

    const message = page.getByTestId("scanner-message");
    await showQr(page, `${baseURL ?? "http://localhost:3100"}/s/BREW42?src=qr`);
    await expect(message).toContainText("That's your shop's QR", { timeout: FRAMES_MS });

    // Well-shaped but not signed by us: the server says invalid, the scanner says what to do.
    await showQr(page, `MQ1.${"A".repeat(58)}`);
    await expect(message).toContainText("isn't a Moz Rewards member QR");

    const { memberId } = await member.card();
    const expired = await page.request.post("/api/test/expired-member-qr", {
      data: { memberId },
      headers: testApiHeaders(),
    });
    expect(expired.ok()).toBe(true);
    await showQr(page, ((await expired.json()) as { token: string }).token);
    await expect(message).toContainText("This member QR has expired");
    await expect(page.getByTestId("approve-form")).toHaveCount(0);
    await shoot("scan-refused-1440", { fullPage: false });

    // A good one opens the side panel (desktop) with the typed-amount box, no number pad.
    await showQr(page, (await member.card()).token);
    const form = page.getByTestId("approve-form");
    await expect(form).toBeVisible({ timeout: FRAMES_MS });
    await expect(form.getByTestId("approve-pad")).toHaveCount(0);
    await shoot("scan-award-1440", { fullPage: false });
    expect(workers).toEqual([]);
  } finally {
    await member.context.close();
  }
});

test("[P2-02] J4: camera denied → manual member ID: format, non-member and member answers; offline blocks", async ({
  page,
  context,
  browser,
  baseURL,
  signInAs,
}) => {
  test.setTimeout(90_000);
  const member = await customer(browser, baseURL ?? "");
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    await fakeCamera(page, { decoder: "worker", deny: true });
    await signInAs("staff", { shopId });
    await page.setViewportSize({ width: 390, height: 844 });
    await openScanner(page);
    await page.getByTestId("scanner-start").click();
    await expect(page.getByTestId("scanner-view")).toHaveAttribute("data-state", "denied");
    await expect(page.getByTestId("scanner-explainer")).toContainText("The camera is blocked");

    const manual = page.getByTestId("scanner-manual");
    const field = manual.getByLabel("Member ID");
    await field.fill("K7Q-42");
    await manual.getByTestId("scanner-find").click();
    await expect(manual).toContainText("Member IDs are 6 letters and numbers");

    // A well-formed ID that isn't this shop's member: one answer, nothing revealed.
    await field.fill("ZZZ-ZZZ");
    await manual.getByTestId("scanner-find").click();
    await expect(page.getByTestId("scanner-message")).toContainText(
      "isn't a member of your shop yet",
    );

    const { memberId } = await member.card();
    await field.fill(memberId.toLowerCase());
    await manual.getByTestId("scanner-find").click();
    await expect(page.getByRole("dialog", { name: "Award gold" })).toContainText(memberId);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("approve-form")).toHaveCount(0);

    await context.setOffline(true);
    await expect(page.getByTestId("scanner-offline")).toContainText("You're offline");
    await expect(manual.getByTestId("scanner-find")).toBeDisabled();
    await expect(page.getByTestId("scanner-start")).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByTestId("scanner-offline")).toHaveCount(0);
  } finally {
    await member.context.close();
  }
});

test("[P2-02] J4: a member with a request waiting is sent to that request's approve panel", async ({
  page,
  browser,
  baseURL,
  signInAs,
}) => {
  test.setTimeout(90_000);
  const member = await customer(browser, baseURL ?? "");
  try {
    const { shopId } = await seedShop(page.request, member.userId);
    const phone = await member.context.newPage();
    await phone.goto(`/shops/${shopId}`);
    // A tap before hydration does nothing (no handler yet).
    await expect(phone.locator("html")).toHaveAttribute("data-hydrated", "true");
    await phone.getByTestId("request-points").click();
    await expect(phone.getByTestId("request-pending")).toBeVisible({ timeout: DECIDE_MS });

    await fakeCamera(page, { decoder: "native" });
    await signInAs("staff", { shopId });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openScanner(page);
    await startCamera(page);
    await showQr(page, (await member.card()).token);
    const waiting = page.getByTestId("scanner-open-request");
    await expect(waiting).toContainText(`${NAME} already asked for gold`, { timeout: FRAMES_MS });
    await waiting.getByTestId("scanner-open-request-link").click();
    await expect(page).toHaveURL(/\/dashboard\/requests\?approve=/);
    await expect(page.getByRole("dialog", { name: "Process request" })).toContainText(NAME);
    await expect(page.getByTestId("approve-form")).toBeVisible();
  } finally {
    await member.context.close();
  }
});
