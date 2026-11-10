import { clientHeaders, expect, openSignInLink, test, uniqueEmail } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * [P0-20] The production build runs as the RLS roles (web: moz_app + moz_auth; it refuses to boot as the owner,
 * a superuser or a BYPASSRLS role — runBootChecks, every environment). Real sign-in (Better Auth as moz_auth)
 * and a scoped page (sessions under RLS as moz_app) work, and each user sees only their own rows.
 */
/** The second user's browser: unlike any project's own (Chromium, WebKit, iPhone), so lists can't be confused. */
const FIREFOX_WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";

type Mail = {
  latestTo: (to: string) => Promise<{ text: string }>;
  countTo: (to: string) => Promise<number>;
  firstLink: (text: string) => string | undefined;
};

async function signIn(page: Page, mail: Mail, email: string): Promise<void> {
  await page.goto("/sign-in?returnTo=%2Fme%2Fsecurity");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await expect.poll(() => mail.countTo(email), { timeout: 10_000 }).toBe(1);
  const link = mail.firstLink((await mail.latestTo(email)).text);
  expect(link, "sign-in link").toBeTruthy();
  await openSignInLink(page, link!);
  await expect(page).toHaveURL(/\/me\/security$/);
}

test("[P0-20] under RLS roles, sign-in works and each user's device list shows only their own sessions", async ({
  page,
  browser,
  baseURL,
  mail,
}) => {
  test.setTimeout(60_000);
  const other = await browser.newContext({
    userAgent: FIREFOX_WINDOWS_UA,
    baseURL: baseURL!,
    extraHTTPHeaders: clientHeaders(),
  });
  const otherPage = await other.newPage();
  await signIn(otherPage, mail, uniqueEmail("e2e-rls-b"));
  await signIn(page, mail, uniqueEmail("e2e-rls-a"));

  const mine = page.getByRole("list").getByRole("listitem");
  await expect(mine).toHaveCount(1);
  await expect(mine.first()).toContainText("This device");
  await expect(page.getByRole("list")).not.toContainText("Firefox on Windows");

  const theirs = otherPage.getByRole("list").getByRole("listitem");
  await expect(theirs).toHaveCount(1);
  await expect(theirs.first()).toContainText("Firefox on Windows");
  await other.close();
});
