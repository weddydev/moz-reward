import { expect, test } from "./support/test";

test("[P0-01] home page loads with no console or network errors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Moz Rewards" })).toBeVisible();
});
