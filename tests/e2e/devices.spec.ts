import { expect, test, uniqueEmail } from "./support/test";
import type { Page } from "@playwright/test";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

/** Sign-in page with the devices page as the way back (Next keeps the path unencoded). */
const BACK_TO_SIGN_IN = /\/sign-in\?returnTo=(%2F|\/)me(%2F|\/)security$/;

type Mail = {
  latestTo: (to: string) => Promise<{ text: string }>;
  countTo: (to: string) => Promise<number>;
  firstLink: (text: string) => string | undefined;
};

/** Real email-link sign-in, landing on the devices page. `nth` = how many links this address has had. */
async function signInByEmail(page: Page, mail: Mail, email: string, nth: number): Promise<void> {
  await page.goto("/sign-in?returnTo=%2Fme%2Fsecurity");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await expect.poll(() => mail.countTo(email), { timeout: 10_000 }).toBe(nth);
  const link = mail.firstLink((await mail.latestTo(email)).text);
  expect(link, "sign-in link").toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/me\/security$/);
}

test("[P0-06] customer sees their signed-in devices and signs another device out", async ({
  page,
  browser,
  baseURL,
  mail,
  shoot,
}) => {
  const email = uniqueEmail("e2e-devices");
  const phone = await browser.newContext({ userAgent: IPHONE_UA, baseURL: baseURL! });
  const phonePage = await phone.newPage();
  await signInByEmail(phonePage, mail, email, 1);
  await signInByEmail(page, mail, email, 2);

  const list = page.getByRole("list");
  await expect(list.getByRole("listitem")).toHaveCount(2);
  await expect(list.getByRole("listitem").first()).toContainText("This device");
  await expect(list).toContainText("Safari on iPhone");
  await expect(list).toContainText(/Signed in \d{1,2} [A-Z][a-z]{2} \d{4}/);
  await shoot("devices-list");

  await page.getByRole("button", { name: "Sign out of Safari on iPhone" }).click();
  await expect(page.getByRole("status")).toHaveText("Signed out of Safari on iPhone.");
  await expect(list.getByRole("listitem")).toHaveCount(1);

  // The phone's next request is signed out.
  await phonePage.goto("/me/security");
  await expect(phonePage).toHaveURL(BACK_TO_SIGN_IN);
  await phone.close();
});

test("[P0-06] sign out everywhere asks first, then ends every session including this one", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  await page.goto("/me/security");

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await expect(page.getByText("Sign out on every device, including this one?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Sign out on every device, including this one?")).toBeHidden();

  await page.getByRole("button", { name: "Sign out everywhere" }).click();
  await page.getByRole("button", { name: "Sign out everywhere" }).click(); // the confirm button
  await expect(page).toHaveURL(/\/sign-in$/);
  const session: unknown = await (await page.request.get("/api/auth/get-session")).json();
  expect(session).toBeNull();
});

test("[P0-06] the devices page sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/me/security");
  await expect(page).toHaveURL(BACK_TO_SIGN_IN);
});
