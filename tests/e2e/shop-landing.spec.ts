import { mkdirSync } from "node:fs";
import path from "node:path";
import { type APIRequestContext, type Page } from "@playwright/test";
import {
  clientHeaders,
  expect,
  newClientContext,
  newClientIp,
  test,
  testApiHeaders,
} from "./support/test";

// P1-02: shop landing `/s/[code]` on the production build (states, CSP + caching headers, member state,
// lookup limit, fallbacks). Screenshots at every project size (.artifacts/screens/P1-02).

type ShopState =
  "pending" | "active" | "expiring" | "grace" | "restricted" | "suspended" | "closed";

async function seedShop(
  request: APIRequestContext,
  body: {
    status: ShopState;
    name?: string;
    details?: boolean;
    cover?: boolean;
    memberUserId?: string;
  },
): Promise<{ shopId: string; shopCode: string }> {
  const res = await request.post("/api/test/shop", { data: body, headers: testApiHeaders() });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shopId: string; shopCode: string };
}

/** Serves the seeded cover (`cover: true`) from the fixture; the app itself never serves that path. */
async function serveCover(page: Page): Promise<void> {
  await page.route("**/e2e-fixtures/shop-cover.jpg", (route) =>
    route.fulfill({
      path: path.join(__dirname, "fixtures", "shop-cover.jpg"),
      contentType: "image/jpeg",
    }),
  );
}

const nonceOf = (csp: string | undefined): string | undefined =>
  /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp ?? "")?.[1];

test("[P1-02] active shop: screen 1 content, Collect points to sign-in, screenshots", async ({
  page,
  request,
  shoot,
}) => {
  const { shopCode } = await seedShop(request, {
    status: "active",
    name: "Brew & Bloom Café",
    details: true,
    cover: true,
  });
  await serveCover(page);
  const res = await page.goto(`/s/${shopCode.toLowerCase()}?src=qr`);
  expect(res?.status()).toBe(200);
  // A real cover, so the shots show the m01 composition (ivory fade, overlapping logo) and the LCP image
  // (P1-02 design review MEDIUM 2).
  const cover = page.getByTestId("landing-cover");
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  await expect(page.getByTestId("landing-name")).toHaveText("Brew & Bloom Café");
  // The page's own line (the gate, aria-hidden decoration, carries the same words as its subtitle: PD-09).
  await expect(page.locator("#main").getByText("Café · Shoreditch")).toBeVisible();
  await expect(page.getByTestId("landing-status")).toHaveText(/^(Open|Closes soon|Closed)/);
  await expect(page.getByTestId("landing-hours").getByText("Monday")).toBeVisible();
  await expect(
    page.getByTestId("landing-details").getByText("12 High Street, Shoreditch, E1 6AN"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions" })).toHaveAttribute(
    "href",
    /google\.com\/maps/,
  );
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+442071234567",
  );
  await expect(page.getByTestId("landing-collect")).toHaveAttribute(
    "href",
    // P1-04: back from sign-in, `?join=1` opens the join sheet.
    `/sign-in?returnTo=${encodeURIComponent(`/s/${shopCode}?join=1`)}`,
  );
  await expect(page.getByText("Powered by Moz Rewards")).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`/s/${shopCode}$`),
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shoot("shop-landing");
  await page.setViewportSize({ width: 320, height: 720 });
  await shoot("shop-landing-320");
});

test("[P1-02] HTML: fresh nonce per request, never cacheable by a shared cache", async ({
  request,
}) => {
  const { shopCode } = await seedShop(request, { status: "active" });
  const a = await request.get(`/s/${shopCode}`);
  const b = await request.get(`/s/${shopCode}`);
  for (const r of [a, b]) {
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toBe("private, no-store");
    expect(r.headers()["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  }
  const na = nonceOf(a.headers()["content-security-policy"]);
  expect(na).toBeDefined();
  expect(na).not.toBe(nonceOf(b.headers()["content-security-policy"]));
  // Next nonces its own scripts with the request's nonce.
  expect(await a.text()).toContain(`nonce="${na ?? "missing"}"`);
});

test("[P1-02] unknown, impossible and pending codes: a designed 404", async ({ page, request }) => {
  const pending = await seedShop(request, { status: "pending" });
  // A malformed escape is refused by the proxy before any render (it would otherwise be a framework 500).
  expect((await request.get("/s/%E0%A4%A")).status()).toBe(400);
  for (const path of ["/s/ZZZZZZ", "/s/0OIL1Z", `/s/${pending.shopCode}`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "We can't find that shop" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter a shop code" })).toHaveAttribute(
      "href",
      "/scan",
    );
  }
});

test("[P1-02] suspended and closed shops: friendly pages, not indexed; restricted works normally", async ({
  page,
  request,
  shoot,
}) => {
  const suspended = await seedShop(request, { status: "suspended", name: "Paused Pantry" });
  await page.goto(`/s/${suspended.shopCode}`);
  await expect(
    page.getByRole("heading", { name: "Paused Pantry is taking a break" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByTestId("landing-collect")).toHaveCount(0);
  await shoot("shop-landing-suspended");

  const closed = await seedShop(request, { status: "closed", name: "Gone Grocer" });
  await page.goto(`/s/${closed.shopCode}`);
  await expect(page.getByText("This shop is no longer on Moz Rewards.")).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const restricted = await seedShop(request, { status: "restricted", name: "Still Here Deli" });
  await page.goto(`/s/${restricted.shopCode}`);
  await expect(page.getByTestId("landing-name")).toHaveText("Still Here Deli");
  await expect(page.getByTestId("landing-collect")).toBeVisible();
});

test("[P1-02] missing cover, logo, hours and contact details; a 60-character name", async ({
  page,
  request,
  shoot,
}) => {
  const name = "The Exceptionally Long Named Neighbourhood Coffee House Ltd";
  expect(name.length).toBeLessThanOrEqual(60);
  const { shopCode } = await seedShop(request, { status: "active", name });
  await page.goto(`/s/${shopCode}`);
  await expect(page.getByTestId("landing-name")).toHaveText(name);
  const fallback = page.getByTestId("landing-cover-fallback");
  await expect(fallback).toBeVisible();
  // Design review: the no-cover state is a quiet surface, never a gold block (gold ≤ 10%, DESIGN §3); PD-11: the
  // shop page's dark photo ground.
  expect(await fallback.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  // No logo: the metal monogram coin in the cover's gold ring (DESIGN §6.4), never bare initials.
  await expect(page.locator("#main").getByTestId("shop-coin")).toHaveText("TL");
  // No empty actions row when there is neither Directions nor Call.
  await expect(page.getByTestId("landing-details").getByRole("link")).toHaveCount(0);
  // Footer legal links: 44px hit areas (DESIGN §13).
  for (const label of ["Terms", "Privacy"]) {
    const hit = await page
      .getByRole("link", { name: label })
      .evaluate((el) => getComputedStyle(el, "::after").height);
    expect(Number.parseFloat(hit)).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByText("Opening hours not added yet.")).toBeVisible();
  await expect(page.getByText("Contact details not added yet.")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await shoot("shop-landing-fallbacks");
});

test("[PD-11] a cover that can't load gives way to the cover's ground (no broken-image glyph)", async ({
  page,
  request,
}) => {
  const { shopCode } = await seedShop(request, { status: "active", cover: true });
  await page.route("**/e2e-fixtures/shop-cover.jpg", (route) => route.fulfill({ status: 404 }));
  await page.goto(`/s/${shopCode}`);
  await expect(page.getByTestId("landing-name")).toBeVisible();
  // The photo steps aside (also when it failed before hydration); the dark ground, shade and coin stay.
  await expect(page.locator("#main [data-gate-cover] img")).toHaveCount(0);
  const ground = await page
    .locator("#main [data-gate-cover]")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(ground).toBe("rgb(42, 32, 20)"); // --photo-ground
  await expect(page.locator("#main [data-gate-cover] .m-art-shade")).toHaveCount(1);
});

test("[P1-02] a member sees their state; the anonymous HTML never carries it", async ({
  page,
  request,
  signInAs,
  browser,
  baseURL,
}) => {
  const customer = await signInAs("customer");
  const { shopId, shopCode } = await seedShop(request, {
    status: "active",
    memberUserId: customer.userId,
  });
  await page.goto(`/s/${shopCode}`);
  await expect(page.getByText("You’re a member")).toBeVisible();
  await expect(page.getByTestId("landing-collect")).toHaveAttribute("href", `/shops/${shopId}`);

  // Same code straight after, from a signed-out visitor: the cached shop data is shared, the member state isn't.
  const visitor = await newClientContext(browser, baseURL!);
  const anon = await visitor.newPage();
  await anon.goto(`/s/${shopCode}`);
  await expect(anon.getByTestId("landing-name")).toBeVisible();
  await expect(anon.getByText("You’re a member")).toHaveCount(0);
  expect(await anon.content()).not.toContain(customer.email);
  await expect(anon.getByTestId("landing-collect")).toHaveAttribute(
    "href",
    /^\/sign-in\?returnTo=/,
  );
  await visitor.close();
});

test("[P1-02] the 61st lookup from one address within a minute gets a friendly 429", async ({
  playwright,
  baseURL,
}) => {
  const ip = newClientIp();
  const api = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  // Unknown codes: the limit runs before any render, so these cost no database read either.
  for (let i = 0; i < 60; i++) {
    expect((await api.get("/s/ZZZZZZ", { maxRedirects: 0 })).status()).toBe(404);
  }
  const over = await api.get("/s/ZZZZZZ");
  expect(over.status()).toBe(429);
  expect(Number(over.headers()["retry-after"])).toBeGreaterThan(0);
  expect(over.headers()["cache-control"]).toBe("private, no-store");
  expect(await over.text()).toContain("Too many shop lookups");
  // A prefetch header doesn't skip the limit.
  const prefetch = await api.get("/s/ZZZZZZ", { headers: { "next-router-prefetch": "1" } });
  expect(prefetch.status()).toBe(429);
  await api.dispose();
});

test.describe("cookie notice on the landing, before any choice", () => {
  test.use({ analyticsConsent: null });

  // P1-02 design review MEDIUM 5: the server-rendered first paint (buttons kept invisible until hydration) and
  // the hydrated notice, at 320 and 390; the fixed notice never blocks Collect points.
  test("[P1-02] cookie notice: first paint and hydrated at 320 and 390, Collect points stays reachable", async ({
    browser,
    baseURL,
    page,
    request,
    shoot,
  }, testInfo) => {
    const { shopCode } = await seedShop(request, { status: "active", details: true, cover: true });
    const { deviceScaleFactor, isMobile, hasTouch, userAgent } = testInfo.project.use;
    for (const size of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
    ]) {
      // First paint: the server HTML and styles alone (no JavaScript, so nothing hydrates), no consent stored.
      const firstPaint = await browser.newContext({
        baseURL: baseURL ?? "",
        extraHTTPHeaders: clientHeaders(),
        javaScriptEnabled: false,
        viewport: size,
        ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
        ...(isMobile ? { isMobile } : {}),
        ...(hasTouch ? { hasTouch } : {}),
        ...(userAgent ? { userAgent } : {}),
      });
      const raw = await firstPaint.newPage();
      await serveCover(raw);
      await raw.goto(`/s/${shopCode}`);
      const rawNotice = raw.getByRole("region", { name: "Cookies" });
      await expect(rawNotice).toBeVisible();
      await expect(rawNotice.locator("[data-consent-actions]")).toBeHidden();
      await expect(raw.getByTestId("landing-collect")).toBeVisible();
      const dir = path.join(".artifacts", "screens", "P1-02");
      mkdirSync(dir, { recursive: true });
      await raw.screenshot({
        path: path.join(
          dir,
          `landing-cookies-first-paint-${String(size.width)}--${testInfo.project.name}.png`,
        ),
        animations: "disabled",
      });
      await firstPaint.close();

      // Hydrated: the buttons turn visible only once the notice has hydrated.
      await serveCover(page);
      await page.setViewportSize(size);
      await page.goto(`/s/${shopCode}`);
      const notice = page.getByRole("region", { name: "Cookies" });
      await expect(notice.getByRole("button", { name: "No thanks" })).toBeVisible();
      await shoot(`landing-cookies-hydrated-${String(size.width)}`, { fullPage: false });
      // Playwright scrolls Collect into view and fails if anything (the fixed notice) covers its centre.
      await page.getByTestId("landing-collect").click({ trial: true, timeout: 5_000 });
    }
  });
});
