import { clientHeaders, expect, openSignInLink, test, uniqueEmail } from "./support/test";
import type { Page } from "@playwright/test";

type SessionResponse = { user: { email: string } } | null;

async function requestLink(page: Page, email: string, returnTo = "/wallet"): Promise<void> {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
}

test("[P0-19] mail-scanner GETs of the sign-in link consume nothing; the person's click signs in once", async ({
  page,
  mail,
  request,
  shoot,
}) => {
  const email = uniqueEmail("e2e-scanner");
  await requestLink(page, email);
  const link = mail.firstLink((await mail.latestTo(email)).text) ?? "";
  expect(new URL(link).pathname).toBe("/sign-in/confirm");

  // A scanner fetches the link (twice, as some do) and the library's old verify URL: nothing is consumed.
  for (let i = 0; i < 2; i++) {
    const scan = await request.get(link, { maxRedirects: 0 });
    expect(scan.status()).toBe(200);
    expect(await scan.text()).toContain("Finish signing in");
    expect(scan.headers()["set-cookie"] ?? "").not.toContain("session_token");
  }
  const token = new URL(link).searchParams.get("token") ?? "";
  const old = await request.get(
    `/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fwallet`,
    {
      maxRedirects: 0,
    },
  );
  expect(old.status()).toBe(404);

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Finish signing in" })).toBeVisible();
  await shoot("customer-confirm-sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/wallet$/);
  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(email);
});

test("[P0-19] the confirm page signs in without JavaScript (plain form POST) and keeps the return path", async ({
  page,
  mail,
  browser,
  baseURL,
}) => {
  const email = uniqueEmail("e2e-nojs");
  await requestLink(page, email, "/me/security");
  const link = mail.firstLink((await mail.latestTo(email)).text) ?? "";

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: baseURL!,
    extraHTTPHeaders: clientHeaders(),
  });
  const tab = await noJs.newPage();
  await openSignInLink(tab, link);
  await expect(tab).toHaveURL(/\/me\/security$/);
  const cookies = await noJs.cookies();
  expect(cookies.some((c) => c.name.includes("session_token"))).toBe(true);
  await noJs.close();
});

test("[P0-19] a double press on the confirm button still signs in once (the second press is ignored)", async ({
  page,
  mail,
}) => {
  const email = uniqueEmail("e2e-double");
  await requestLink(page, email);
  const link = mail.firstLink((await mail.latestTo(email)).text) ?? "";
  await page.goto(link);
  const button = page.getByRole("button", { name: "Sign in" });
  await expect(button).toBeVisible();
  // Wait for hydration (the guard lives in the client form), then press twice quickly.
  await expect(page.locator("form[data-hydrated]")).toBeAttached();
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/sign-in/confirm")) posts += 1;
  });
  await button.dblclick();
  await expect(page).toHaveURL(/\/wallet$/);
  expect(posts).toBe(1);
  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(email);
});
