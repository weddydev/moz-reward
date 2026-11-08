import { TOTP } from "otpauth";
import { expect, test, uniqueEmail } from "./support/test";

type SessionResponse = { user: { email: string }; session: { mfaVerified?: boolean } } | null;

test("[P0-06] customer signs in with an email link (Mailpit)", async ({ page, mail }) => {
  const email = uniqueEmail("e2e-customer");
  await page.goto("/sign-in?returnTo=%2Fwallet");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  const message = await mail.latestTo(email);
  const link = mail.firstLink(message.text);
  expect(link, "sign-in link in the email").toBeTruthy();

  await page.goto(link!);
  await expect(page).toHaveURL(/\/wallet$/);
  const session = (await (await page.request.get("/api/auth/get-session")).json()) as SessionResponse;
  expect(session?.user.email).toBe(email);
  expect(session?.session.mfaVerified).toBe(false);
});

test("[P0-06] staff enrols TOTP and signs in with a second factor", async ({ page, createUser }) => {
  const user = await createUser("e2e-staff");
  const TEST_PASSWORD = user.password;

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

  await page.getByLabel("6-digit code").fill(totp.generate());
  await page.getByRole("button", { name: "Turn on two-step verification" }).click();
  await expect(page).toHaveURL(/\/staff\/sign-in\?enrolled=1/);
  await expect(page.getByText("Two-step verification is on")).toBeVisible();

  // Sign in again: now a code is required.
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  const codeInput = page.getByLabel("6-digit code from your authenticator app");
  await expect(codeInput).toBeVisible();

  // Never replay the enrolment code, and never sleep: the server accepts ±1 period (better-auth
  // verifyTOTP window = 1), so use the *next* period's code, which always differs from the first.
  await codeInput.fill(totp.generate({ timestamp: Date.now() + 30_000 }));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const session = (await (await page.request.get("/api/auth/get-session")).json()) as SessionResponse;
  expect(session?.user.email).toBe(user.email);
  expect(session?.session.mfaVerified).toBe(true);
});
