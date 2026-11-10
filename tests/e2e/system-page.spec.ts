import { expect, test, testApiHeaders } from "./support/test";
import type { Page } from "@playwright/test";

/**
 * P0-13 AC3: the admin System page shows queue lag, outbox age, backups and quota usage from a local health
 * snapshot; admin owner only. Screens at 320, 390 and 1440 (TESTING §8).
 */
async function seedSnapshot(page: Page): Promise<void> {
  const res = await page.request.post("/api/test/ops-snapshot", {
    headers: testApiHeaders(),
    data: {},
  });
  expect(res.status()).toBe(200);
}

test("[P0-13] signed out: /admin/system sends you to staff sign-in and back", async ({ page }) => {
  await page.goto("/admin/system");
  await expect(page).toHaveURL(/\/staff\/sign-in\?returnTo=%2Fadmin%2Fsystem$/);
});

test("[P0-13] an admin who is not the owner sees no system data", async ({ page, signInAs }) => {
  await signInAs("admin_support");
  await page.goto("/admin/system");
  await expect(
    page.getByText("You don't have access to this page. It is for the admin owner."),
  ).toBeVisible();
  await expect(page.getByText("Emails sent today")).toHaveCount(0);
});

test("[P0-13] AC3: the admin owner sees status, queues, outbox, backups and quotas", async ({
  page,
  signInAs,
  shoot,
}) => {
  await signInAs("admin_owner");
  await seedSnapshot(page);
  await page.goto("/admin/system");
  await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible();
  await expect(
    page.getByText(/^Snapshot from \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}/),
  ).toBeVisible();
  for (const label of ["Database", "Redis (queue)", "Scheduler"]) {
    await expect(page.getByRole("listitem").filter({ hasText: label })).toBeVisible();
  }
  await expect(
    page.getByRole("region", { name: "Queues" }).getByRole("cell", { name: "email" }),
  ).toBeVisible();
  await expect(page.getByText("Oldest waiting").first()).toBeVisible();
  await expect(page.getByText("Emails sent today")).toBeVisible();
  await expect(page.getByText(/of 400 \(\d+%\)|Not counted yet/).first()).toBeVisible();
  await expect(page.getByText("Not set up yet (comes with staging)")).toBeVisible();
  await shoot("system-page", { fullPage: true });
  if (test.info().project.name === "chromium") {
    await page.setViewportSize({ width: 320, height: 720 });
    await shoot("system-page-320", { fullPage: true });
  }
});
