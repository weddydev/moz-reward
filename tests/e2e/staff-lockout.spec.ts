import { expect, test } from "./support/test";

/**
 * Staff lockout UI (P0-19, SECURITY §2). The E2E server sees every request as one source ("local"), so the
 * "account needs a check" state is seeded through the real guard from distinct addresses (test API).
 */
const SIGN_IN = /\/api\/auth\/sign-in\/email$/;

test.describe("security check", () => {
  test.use({
    // The first attempt is answered 400 TURNSTILE_REQUIRED by design; browsers log any 4xx fetch.
    guardAllow: [/^console: Failed to load resource: the server responded with a status of 400/],
  });

  test("[P0-19] an account past its failure limit runs the security check, then the right password signs in", async ({
    page,
    createUser,
  }) => {
    const user = await createUser("e2e-staff-check", { failedSignIns: 5 });
    const attempts: Array<{ status: number; token: string | null }> = [];
    page.on("response", (res) => {
      if (SIGN_IN.test(res.url())) {
        attempts.push({
          status: res.status(),
          token: res.request().headers()["x-turnstile-token"] ?? null,
        });
      }
    });

    await page.goto("/staff/sign-in");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Continue" }).click();

    // Password-only staff land on 2FA enrolment: the check ran and the form re-sent itself once.
    await expect(page).toHaveURL(/\/staff\/security/);
    expect(attempts).toEqual([
      { status: 400, token: null },
      { status: 200, token: expect.any(String) as unknown },
    ]);
  });
});

test.describe("source lock", () => {
  test.use({
    guardAllow: [
      /^console: Failed to load resource: the server responded with a status of (401|429)/,
    ],
  });

  test("[P0-19] repeated wrong passwords from one device pause it with a clear wait message", async ({
    page,
    createUser,
  }) => {
    const user = await createUser("e2e-staff-source");
    await page.goto("/staff/sign-in");
    await page.getByLabel("Email").fill(user.email);
    const alert = page.locator("form").getByRole("alert");
    for (let i = 0; i < 5; i++) {
      await page.getByLabel("Password").fill(`wrong-password-${String(i)}`);
      const answered = page.waitForResponse(SIGN_IN);
      await page.getByRole("button", { name: "Continue" }).click();
      expect((await answered).status()).toBe(401);
      await expect(alert).toHaveText("Email or password is incorrect.");
      await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    }
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(alert).toHaveText(/Too many attempts\. Please wait \d+ minutes? and try again\./);
    await expect(page).toHaveURL(/\/staff\/sign-in/);
  });
});
