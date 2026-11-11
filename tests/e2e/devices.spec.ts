import { expect, newClientContext, openSignInLink, test, uniqueEmail } from "./support/test";
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
  await openSignInLink(page, link!);
  await expect(page).toHaveURL(/\/me\/security$/);
}

test("[P0-06] customer sees their signed-in devices and signs another device out", async ({
  page,
  browser,
  baseURL,
  mail,
  shoot,
}) => {
  // Two real email-link sign-ins (two devices) plus a screenshot: ~20 UI steps, which ran past the default
  // 30 s on WebKit under a full parallel run. It can't be split: both devices must be signed in at once.
  test.setTimeout(60_000);
  const email = uniqueEmail("e2e-devices");
  const phone = await newClientContext(browser, baseURL!, { userAgent: IPHONE_UA });
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
  await expect(page.getByRole("heading", { name: "Signed-in devices" })).toBeFocused(); // not <body>

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

test("[P0-06] keyboard: the confirm takes focus, Escape and Cancel return it, nothing falls to <body>", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  await page.goto("/me/security");
  const trigger = page.locator("#sign-out-everywhere");
  await expect(trigger).toBeEnabled(); // hydrated: a key press before that would be lost
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#confirm-everywhere-yes")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#sign-out-everywhere")).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Cancel" }).press("Enter");
  await expect(page.locator("#sign-out-everywhere")).toBeFocused();
});

test("[P0-06] a customer who opens the staff security page is sent to their own devices page", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  await page.goto("/staff/security");
  await expect(page).toHaveURL(/\/me\/security$/);
});

test("[P0-14] before hydration the devices buttons are disabled, so no press is silently lost", async ({
  page,
  signInAs,
}) => {
  await signInAs("customer");
  // Hold the app's JavaScript until the test releases it: a deterministic "slow phone", no timing.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/chunks/**/*.js", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/me/security", { waitUntil: "commit" });
  const trigger = page.locator("#sign-out-everywhere");
  await expect(trigger).toBeDisabled();
  // The hydration marker the E2E guard waits for (P0-18) is absent until the app's JS has run.
  await expect(page.locator("html")).not.toHaveAttribute("data-hydrated", "true");

  release();
  await expect(trigger).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#confirm-everywhere-yes")).toBeFocused();
});
