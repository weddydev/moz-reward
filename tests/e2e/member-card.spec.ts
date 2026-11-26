import { qrPath } from "@/features/member-card/qr-path";
import { OFFLINE_NOTE } from "@/features/member-card/qr-state";
import { expect, test } from "./support/test";
import type { BrowserContext, Page } from "@playwright/test";

// P1-14 on the production build: the member card with the live member QR (Me and the shop page), the offline
// card from the service worker (renders after one online visit, the QR only while its token is fresh, never past
// a day), sign-out and a second account leaving no card behind, the worker caching nothing but the shell and the
// one card payload, a worker update while the card is open, and Chromium installability.
// Screenshots at 390, 320 and 1440 (.artifacts/screens/P1-14).

test.use({
  serviceWorkers: "allow",
  // Offline with no card cached, the worker answers the card fetch with its own 503 ("You're offline"): that is
  // the behaviour under test, not a server error.
  guardAllow: [/^http5xx: 503 GET http:\/\/localhost:\d+\/api\/me\/member-qr$/],
});

type Card = {
  token: string;
  memberId: string;
  firstName: string;
  serverNow: number;
  expiresAt: number;
  cacheUntil: number;
  owner: string;
};

const card = (page: Page) => page.getByTestId("member-card");
// Enter turns the card (a tap does too); the keyboard way, because on touch screens the card sways while idle,
// so it is never "stable" for a pointer click.
const flipToQr = async (page: Page): Promise<void> => {
  await card(page).locator(".m-mcard").focus();
  await page.keyboard.press("Enter");
  await expect(card(page).locator(".m-mcard")).toHaveAttribute("data-face", "back");
};

/**
 * Opens Me online and waits until the worker controls the page and holds the shell and this card; returns the
 * card payload the worker kept (the card refetches when the worker takes over, so not the first response).
 */
async function openOnline(page: Page): Promise<Card> {
  await page.goto("/me");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const cached = (): Promise<Card | null> =>
    page.evaluate(async () => {
      const shell = await (await caches.open("moz-shell-v1")).match("/offline");
      const tok = await (await caches.open("moz-card-token")).match("/api/me/member-qr");
      return shell && tok ? ((await tok.json()) as Card) : null;
    });
  await expect.poll(cached, { timeout: 15_000 }).not.toBeNull();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.waitForLoadState("networkidle");
  return (await cached()) as Card;
}

/** Cuts the network once the page has settled (KI-49: a prefetch or chunk cut by the switch fails on its own). */
async function goOffline(page: Page, context: BrowserContext): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).not.toHaveAttribute("data-monitoring", "loading");
  await context.setOffline(true);
}

async function cacheKeys(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    }
    return out;
  });
}

test("[P1-14] Me shows the member card; the QR is the signed token, never the member ID", async ({
  page,
  signInAs,
  shoot,
}) => {
  test.setTimeout(60_000);
  await signInAs("customer");
  // The card refetches when the worker first takes over, so the QR shows the latest token: keep each one.
  const tokens: Card[] = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/api/me/member-qr") && r.ok()) {
      expect(r.headers()["cache-control"]).toBe("private, no-store");
      void r.json().then((b: Card) => tokens.push(b));
    }
  });
  await page.goto("/me");
  await expect.poll(() => tokens.length).toBeGreaterThan(0);
  const payload = tokens[0] as Card;

  await expect(card(page)).toBeVisible();
  const memberId = (await page.getByTestId("member-id").textContent())?.trim() ?? "";
  expect(memberId).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/);
  expect(payload.memberId).toBe(memberId);
  expect(payload.token).toMatch(/^MQ1\.[A-Za-z0-9_-]{58}$/);
  expect(payload.token).not.toContain(memberId.replace("-", ""));
  // Five minutes, the expiry in whole seconds (so up to 1 s less).
  expect(payload.expiresAt - payload.serverNow).toBeGreaterThan(5 * 60_000 - 1000);
  expect(payload.expiresAt - payload.serverNow).toBeLessThanOrEqual(5 * 60_000);
  // Only the first name travels in the payload the phone keeps.
  expect(payload.firstName).not.toContain(" ");

  await flipToQr(page);
  const qr = page.getByTestId("member-qr");
  await expect(qr).toBeVisible();
  await expect(card(page)).toContainText("Show this at the till");
  // The drawn modules are exactly the token's QR code.
  await page.waitForLoadState("networkidle");
  const latest = tokens.at(-1) as Card;
  expect(latest.memberId).toBe(memberId);
  expect(await qr.locator("path").getAttribute("d")).toBe(qrPath(latest.token).d);

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await shoot(`me-card-qr-${width}`);
  }
});

test("[P1-14] the card renders offline after one online visit; deep links fall back to it", async ({
  page,
  context,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  await signInAs("customer");
  const payload = await openOnline(page);

  await goOffline(page, context);
  await page.goto("/me");
  await expect(page.getByRole("heading", { level: 1, name: "You’re offline" })).toBeVisible();
  await expect(page.getByTestId("member-id")).toHaveText(payload.memberId);
  await expect(card(page)).toContainText(payload.firstName);
  await flipToQr(page);
  await expect(page.getByTestId("member-qr").locator("path")).toHaveAttribute(
    "d",
    qrPath(payload.token).d,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot("offline-card-qr-390");

  // A deep link loaded offline gets the same shell, and stays put (no router reload loop).
  await page.goto("/wallet");
  await expect(page.getByTestId("member-id")).toHaveText(payload.memberId);
  const url = page.url();
  await page.waitForTimeout(1500);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("member-id")).toHaveText(payload.memberId);

  await context.setOffline(false);
});

test("[P1-14] offline, an expired token shows the member ID large, never a stale QR; a day later no card", async ({
  page,
  context,
  signInAs,
  shoot,
}) => {
  test.setTimeout(90_000);
  await signInAs("customer");
  const payload = await openOnline(page);

  await goOffline(page, context);
  await page.clock.install();
  await page.goto("/me");
  await expect(page.getByTestId("member-id")).toHaveText(payload.memberId);
  await flipToQr(page);
  await expect(page.getByTestId("member-qr")).toBeVisible();

  // Six minutes on: the token is dead, the QR goes and the member ID takes its place.
  await page.clock.fastForward("06:00");
  await expect(page.getByTestId("member-qr")).toHaveCount(0);
  await expect(page.getByTestId("member-qr-offline")).toContainText(payload.memberId);
  await expect(card(page)).toContainText(OFFLINE_NOTE);
  await page.setViewportSize({ width: 390, height: 844 });
  await shoot("offline-card-expired-390");

  // A reload offline still knows the card (the token counts from when it arrived, not from now).
  await page.reload();
  await flipToQr(page);
  await expect(page.getByTestId("member-qr")).toHaveCount(0);
  await expect(page.getByTestId("member-qr-offline")).toContainText(payload.memberId);

  // Past the day the phone may keep it: gone.
  await page.clock.fastForward("25:00:00");
  await page.reload();
  await expect(page.getByTestId("offline-no-card")).toBeVisible();
  await expect(page.getByTestId("member-id")).toHaveCount(0);
  expect(await page.content()).not.toContain(payload.memberId);
  await context.setOffline(false);
});

test("[P1-14] sign-out clears the cached card", async ({ page, context, signInAs }) => {
  test.setTimeout(90_000);
  await signInAs("customer");
  const payload = await openOnline(page);

  await page.goto("/me/security");
  const signOut = page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-out"));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  // Defence in depth for the HTTP cache (design check M3); the card itself is cleared by the page.
  expect((await (await signOut).allHeaders())["clear-site-data"]).toBe('"cache"');
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await cacheKeys(page))["moz-card-token"] ?? []).toEqual([]);

  await goOffline(page, context);
  await page.goto("/me");
  await expect(page.getByTestId("offline-no-card")).toBeVisible();
  expect(await page.content()).not.toContain(payload.memberId);
  await context.setOffline(false);
});

test("[P1-14] a second account never sees the first one's card", async ({
  page,
  context,
  signInAs,
}) => {
  test.setTimeout(90_000);
  await signInAs("customer");
  const first = await openOnline(page);

  // The session ends without the button (expired, cookies cleared) and someone else signs in.
  await context.clearCookies();
  await signInAs("customer");
  await page.goto("/wallet");
  await expect.poll(async () => (await cacheKeys(page))["moz-card-token"] ?? []).toEqual([]);

  await goOffline(page, context);
  await page.goto("/me");
  await expect(page.getByTestId("offline-no-card")).toBeVisible();
  expect(await page.content()).not.toContain(first.memberId);
  await context.setOffline(false);
});

test("[P1-14] the worker caches only the offline shell and the one card payload", async ({
  page,
  signInAs,
}) => {
  test.setTimeout(60_000);
  const me = await signInAs("customer");
  await openOnline(page);
  // Browse signed-in pages and APIs through the worker.
  for (const path of ["/wallet", "/me", "/me/security", "/vault", "/notifications"]) {
    await page.goto(path);
  }
  await page.evaluate(() => fetch("/api/sse/me").then((r) => r.body?.cancel()));
  expect(me.userId).toBeTruthy();

  const keys = await cacheKeys(page);
  expect(Object.keys(keys).sort()).toEqual(["moz-card-token", "moz-shell-v1"]);
  expect(keys["moz-card-token"]).toEqual(["/api/me/member-qr"]);
  for (const path of keys["moz-shell-v1"] ?? []) {
    const allowed =
      path === "/offline" ||
      path.startsWith("/_next/static/") ||
      ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"].includes(path);
    expect(allowed, path).toBe(true);
  }
  // The cached shell was fetched signed out: no account data in it.
  const shellHtml = await page.evaluate(async () => {
    const hit = await (await caches.open("moz-shell-v1")).match("/offline");
    return hit ? hit.text() : "";
  });
  expect(shellHtml).toContain("You’re offline");
  expect(shellHtml).not.toContain(me.email);
});

test("[P1-14] a worker update while the card is open keeps the card working", async ({
  page,
  signInAs,
}) => {
  test.setTimeout(60_000);
  await signInAs("customer");
  await openOnline(page);
  await flipToQr(page);
  await page.evaluate(() => {
    (window as unknown as { stay: boolean }).stay = true;
  });

  // A new worker script (the same file under a new URL counts as an update) installs and takes over.
  const changed = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            resolve(true);
          },
          {
            once: true,
          },
        );
        setTimeout(() => {
          resolve(false);
        }, 15_000);
      }),
  );
  await page.evaluate(() =>
    navigator.serviceWorker.register("/sw.js?v=update", { scope: "/", updateViaCache: "none" }),
  );
  expect(await changed).toBe(true);
  // No reload, the QR still shows, and the card's next fetch goes through the new worker.
  expect(await page.evaluate(() => (window as unknown as { stay?: boolean }).stay)).toBe(true);
  await expect(page.getByTestId("member-qr")).toBeVisible();
  const status = await page.evaluate(() =>
    fetch("/api/me/member-qr", { cache: "no-store" }).then((r) => r.status),
  );
  expect(status).toBe(200);
});

test("[P1-14] the manifest makes the app installable on Chromium", async ({
  page,
  browserName,
}) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  const m = (await manifest.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  expect(m).toMatchObject({ name: "Moz Rewards", display: "standalone", start_url: "/wallet" });
  expect(m.icons.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
  for (const icon of m.icons) {
    const r = await page.request.get(icon.src);
    expect(r.headers()["content-type"]).toBe("image/png");
  }
  const sw = await page.request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toBe("no-cache");

  test.skip(browserName !== "chromium", "installability is Chromium's own check");
  await page.goto("/sign-in");
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as {
    installabilityErrors: Array<{ errorId: string }>;
  };
  await test.info().attach("installability", { body: JSON.stringify(installabilityErrors) });
  expect(installabilityErrors).toEqual([]);
});
