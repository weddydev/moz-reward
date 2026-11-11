import { expect, newClientContext, openSignInLink, test, uniqueEmail } from "./support/test";

const SEND = "Email me a sign-in link";

test("[P0-06] a used sign-in link shows the friendly expired page, not an error", async ({
  page,
  mail,
  browser,
  baseURL,
}) => {
  const email = uniqueEmail("e2e-reuse");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const link = mail.firstLink((await mail.latestTo(email)).text) ?? "";
  await openSignInLink(page, link); // first use signs in
  await expect(page).toHaveURL(/\/wallet$/);

  const other = await newClientContext(browser, baseURL!);
  const second = await other.newPage();
  await openSignInLink(second, link);
  await expect(second).toHaveURL(/\/sign-in\/link-expired\?error=/);
  await expect(second.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await expect(second.getByRole("link", { name: "Send me a new link" })).toHaveAttribute(
    "href",
    "/sign-in",
  );
  await other.close();
});

test("[P0-06] invalid email gets a field error and sends nothing", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: SEND }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(/Enter a valid email address/);
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("[P0-06] submitting three times at once sends one email", async ({ page, mail }) => {
  const email = uniqueEmail("e2e-triple");
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await expect(page.getByRole("button", { name: SEND })).toBeEnabled();
  await page.locator("form").evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.getByText("Check your email")).toBeVisible();
  await mail.latestTo(email);
  // Give any extra send time to arrive before counting (Mailpit receives in order).
  const marker = uniqueEmail("e2e-triple-marker");
  await page.request.post("/api/auth/sign-in/magic-link", {
    headers: { origin: new URL(page.url()).origin, "x-turnstile-token": "local-turnstile-bypass" },
    data: { email: marker, callbackURL: "/" },
  });
  await mail.latestTo(marker);
  expect(await mail.countTo(email)).toBe(1);
});

test.describe("offline", () => {
  test.use({
    // One regex: Playwright reads a two-element array in test.use() as a [value, options] tuple.
    guardAllow: [
      /^(requestfailed: POST .*\/api\/auth\/sign-in\/magic-link |console: Failed to load resource)/,
    ],
  });

  test("[P0-06] offline submit shows a clear message and the form stays usable", async ({
    page,
    context,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(uniqueEmail("e2e-offline"));
    await expect(page.getByRole("button", { name: SEND })).toBeEnabled();
    // Page fully loaded first: a font or a late JS chunk still downloading when we go offline would fail on
    // its own (CI 43002131604: a chunk request was cut on pixel7), so wait for the network to go quiet too.
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState("networkidle");
    await context.setOffline(true);
    await page.getByRole("button", { name: SEND }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText(/offline|couldn't reach/i);
    await expect(page.getByRole("button", { name: SEND })).toBeEnabled();
    await context.setOffline(false);
  });
});

test.describe("offline (staff)", () => {
  test.use({
    guardAllow: [
      /^(requestfailed: POST .*\/api\/auth\/sign-in\/email |console: Failed to load resource)/,
    ],
  });

  test("[P0-06] staff sign-in offline shows a clear message instead of hanging", async ({
    page,
    context,
  }) => {
    await page.goto("/staff/sign-in");
    await page.getByLabel("Email").fill(uniqueEmail("e2e-staff-offline"));
    await page.getByLabel("Password").fill("correct horse battery");
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState("networkidle"); // see the customer test above
    await context.setOffline(true);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText(/offline|couldn't reach/i);
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    await context.setOffline(false);
  });
});
