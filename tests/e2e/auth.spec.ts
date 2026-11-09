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
  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(email);
  expect(session?.session.mfaVerified).toBe(false);
});

// Two focused tests rather than one long flow: under parallel WebKit load the combined enrolment + second
// sign-in ran past its 30 s budget (about 20 UI steps, each 1–3 s). Each half now has its own budget.
test("[P0-06] staff with a password-only sign-in is sent to enrol TOTP and can turn it on", async ({
  page,
  createUser,
}) => {
  const user = await createUser("e2e-staff");

  await page.goto("/staff/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/staff\/security/);

  await page.getByLabel("Confirm your password").fill(user.password);
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
});

test("[P0-06] enrolled staff must enter a TOTP code, which creates an MFA-verified session", async ({
  page,
  createUser,
}) => {
  const user = await createUser("e2e-staff-2fa", { totp: true });
  const totp = new TOTP({ secret: user.totpSecret ?? "", digits: 6, period: 30 });

  await page.goto("/staff/sign-in");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const codeInput = page.getByLabel("6-digit code from your authenticator app");
  await expect(codeInput).toBeVisible();

  // Never replay the enrolment code, and never sleep: the server accepts ±1 period (better-auth
  // verifyTOTP window = 1), so use the *next* period's code, which always differs from the first.
  await codeInput.fill(totp.generate({ timestamp: Date.now() + 30_000 }));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const session = (await (
    await page.request.get("/api/auth/get-session")
  ).json()) as SessionResponse;
  expect(session?.user.email).toBe(user.email);
  expect(session?.session.mfaVerified).toBe(true);
});
