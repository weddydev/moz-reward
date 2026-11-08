import { expect, test } from "@playwright/test";
import { TOTP } from "otpauth";
import { TEST_PASSWORD, createPasswordUser, testEmail } from "../fixtures/auth";

type SessionResponse = { user: { email: string }; session: { mfaVerified?: boolean } } | null;

test("customer signs in with an email link", async ({ page, request }) => {
  const email = testEmail("e2e-customer");
  await page.goto("/sign-in?returnTo=%2Fwallet");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const res = await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`);
  expect(res.ok()).toBe(true);
  const { message } = (await res.json()) as { message: { text: string } };
  const link = message.text.match(/https?:\/\/\S+/)?.[0];
  expect(link).toBeTruthy();

  await page.goto(link!);
  await expect(page).toHaveURL(/\/wallet$/);
  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(email);
  expect(session?.session.mfaVerified).toBe(false);
});

test("staff enrols TOTP and signs in with a second factor", async ({ page }) => {
  test.setTimeout(90_000);
  const user = await createPasswordUser({ email: testEmail("e2e-staff") });

  // Password-only sign-in sends staff to 2FA enrolment.
  await page.goto("/staff/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/staff\/security/);

  await page.getByLabel("Confirm your password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Set up two-step verification" }).click();
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
  await page.getByText("Can't scan? Enter this key").click();
  const secret = (await page.locator("details code").innerText()).trim();
  const totp = new TOTP({ secret, digits: 6, period: 30 });

  const firstCode = totp.generate();
  await page.getByLabel("6-digit code").fill(firstCode);
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page).toHaveURL(/\/staff\/sign-in\?enrolled=1/);
  await expect(page.getByText("Two-step verification is on")).toBeVisible();

  // Sign in again: now a code is required.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const codeInput = page.getByLabel("6-digit code from your authenticator app");
  await expect(codeInput).toBeVisible();

  // Never replay the enrolment code: wait for the next 30 s window if needed.
  let code = totp.generate();
  while (code === firstCode) {
    await page.waitForTimeout(1_000);
    code = totp.generate();
  }
  await codeInput.fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(user.email);
  expect(session?.session.mfaVerified).toBe(true);
});
