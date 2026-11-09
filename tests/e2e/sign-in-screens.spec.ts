import { expect, test, uniqueEmail } from "./support/test";

// P0-06 "Verify": screenshots of the sign-in screens on every project (mobile + desktop), plus 320 px.

test("[P0-06] customer sign-in names the shop when coming from its page; screenshots", async ({
  page,
  signInAs,
  browser,
  baseURL,
  shoot,
}) => {
  // An owner's shop is active; read its code, then visit sign-in as a signed-out visitor.
  const owner = await signInAs("owner");
  expect(owner.shopCode).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  const visitor = await browser.newContext({ baseURL: baseURL! });
  const p = await visitor.newPage();

  await p.goto(`/sign-in?returnTo=%2Fs%2F${owner.shopCode}`);
  await expect(p.getByTestId("shop-context")).toHaveText(
    "Sign in to collect gold at Brew & Bloom Café.",
  );
  await p.goto("/sign-in?returnTo=%2Fs%2FZZZZZZ"); // unknown shop: no context, no hint it exists
  await expect(p.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await expect(p.getByTestId("shop-context")).toHaveCount(0);
  await visitor.close();

  await page.context().clearCookies();
  await page.goto(`/sign-in?returnTo=%2Fs%2F${owner.shopCode}`);
  await expect(page.getByTestId("shop-context")).toBeVisible();
  await shoot("customer-sign-in-shop");
  await page.setViewportSize({ width: 320, height: 720 });
  await shoot("customer-sign-in-shop-320");
});

test("[P0-06] customer sign-in, check-your-email and expired-link screens", async ({
  page,
  shoot,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toBeVisible();
  await shoot("customer-sign-in");

  await page.getByLabel("Email").fill(uniqueEmail("e2e-screens"));
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  await shoot("customer-check-email");

  await page.goto("/sign-in/link-expired");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot("customer-link-expired");
});

test("[P0-06] staff sign-in and TOTP enrolment screens", async ({ page, createUser, shoot }) => {
  const user = await createUser("e2e-screens-staff");
  await page.goto("/staff/sign-in");
  await expect(page.getByLabel("Password")).toBeVisible();
  await shoot("staff-sign-in");

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/staff\/security/);
  await shoot("staff-totp-enrol");
});
