import { expect, test } from "./support/test";
import { formatDate } from "../../src/lib/format-date";
import type { Page } from "@playwright/test";

/**
 * P1-05 (production build): the owner sets up the loyalty programme from a template, changes it, sees the
 * version history and the 14-day notice for a reward change, and gets field errors from the server; staff get
 * the 403 page and no nav item.
 */
const DAY = 24 * 60 * 60 * 1000;

/** The visible toasts (each is also announced through a screen-reader live region). */
const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

/** Dashboard pages are checked at 320 and 1440 (CLAUDE.md §4 "Screenshots"). */
async function shootWidths(
  page: Page,
  shoot: (name: string) => Promise<string>,
  name: string,
): Promise<void> {
  const before = page.viewportSize();
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(`${name}-${String(width)}`);
  }
  if (before) await page.setViewportSize(before);
}

test.describe("[P1-05] loyalty programme settings", () => {
  test("owner: template → set up → reward change with notice → history; server field errors", async ({
    page,
    signInAs,
    shoot,
    browserName,
    isMobile,
  }) => {
    // Six full-page shots (three states × 320/1440) plus four saves: ~24 s locally on iphone14 (DPR 3), past the
    // 30 s default on CI's CPU-rendered WebKit (CI 45476822891 timed out mid-test, FOLLOWUPS PD-11 step C).
    test.slow(browserName === "webkit" || isMobile, "full-page phone shots; CPU-rendered WebKit");
    await signInAs("owner");
    await page.goto("/dashboard/loyalty");
    await expect(page.getByRole("heading", { level: 1, name: "Loyalty programme" })).toBeVisible();
    await expect(page.getByText("Not set up yet.")).toBeVisible();
    await expect(page.getByText("No versions yet.")).toBeVisible();
    await shootWidths(page, shoot, "loyalty-not-set-up");

    // A template only fills the form.
    await page.getByRole("button", { name: "Restaurant" }).click();
    await expect(page.getByLabel("Gold per £1 spent")).toHaveValue("10");
    await expect(page.getByLabel("Gold to fill one ingot")).toHaveValue("2000");
    await expect(page.getByLabel("Main reward (when the ingot is full)")).toHaveValue(
      "£15 off your bill",
    );
    await page.getByRole("button", { name: "Set up programme" }).click();
    await expect(toasts(page).getByText("Saved. The changes apply now.")).toBeVisible();
    await expect(page.getByText(/^Version 1 · saved /)).toBeVisible();
    await expect(page.getByText("Programme set up")).toBeVisible();
    // Nothing changed yet: nothing to save.
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    // A reward change: saved now, applies to members after 14 days' notice.
    const reward = page.getByLabel("Main reward (when the ingot is full)");
    await reward.fill("Free dessert");
    const saveAt = Date.now();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(toasts(page).getByText(/^Saved\. Members get 14 days' notice/)).toBeVisible();
    await expect(page.getByText(/^Version 2 · saved /)).toBeVisible();
    // The date shown is the save date + 14 days (UK date; a save right at midnight may be either side).
    const notice = page.getByRole("status").filter({ hasText: "New rewards from version 2" });
    await expect(notice).toBeVisible();
    const dates = [saveAt, Date.now()].map((t) => formatDate(new Date(t + 14 * DAY)));
    await expect(notice).toContainText(new RegExp(dates.join("|")));
    await expect(page.getByText("Main reward: “£15 off your bill” → “Free dessert”")).toBeVisible();
    await expect(page.getByText(/^Rewards apply from /)).toBeVisible();
    await shootWidths(page, shoot, "loyalty-reward-notice");

    // Server-side validation reaches the right fields; nothing is saved.
    await page.getByLabel("Gold to fill one ingot").fill("50");
    await reward.fill(" ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("The ingot size must be at least 100.")).toBeVisible();
    await expect(page.getByText("Please describe the main reward.")).toBeVisible();
    await expect(page.getByLabel("Gold to fill one ingot")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/^Version 2 · saved /)).toBeVisible();
    await shootWidths(page, shoot, "loyalty-field-errors");

    // Discard returns to the saved version.
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByLabel("Gold to fill one ingot")).toHaveValue("2000");
    await expect(reward).toHaveValue("Free dessert");
  });

  test("a form left open while the programme changed elsewhere is refused, not overwritten", async ({
    page,
    signInAs,
  }) => {
    await signInAs("owner");
    await page.goto("/dashboard/loyalty");
    await page.getByRole("button", { name: "Set up programme" }).click();
    await expect(page.getByText(/^Version 1 · saved /)).toBeVisible();

    // A second tab of the same owner saves first.
    const other = await page.context().newPage();
    await other.goto("/dashboard/loyalty");
    await other.getByLabel("Gold per approved visit").fill("150");
    await other.getByRole("button", { name: "Save changes" }).click();
    await expect(other.getByText(/^Version 2 · saved /)).toBeVisible();

    await page.getByLabel("Gold per approved visit").fill("120");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "changed in another tab or by another owner",
    );
    await page.reload();
    await expect(page.getByLabel("Gold per approved visit")).toHaveValue("150");
  });

  test("staff get the 403 page and no Loyalty programme nav item", async ({
    page,
    signInAs,
    shoot,
  }) => {
    const owner = await signInAs("owner");
    await page.context().clearCookies();
    if (!owner.shopId) throw new Error("owner without a shop");
    await signInAs("staff", { shopId: owner.shopId });
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Loyalty programme" })).toHaveCount(0);
    const res = await page.goto("/dashboard/loyalty");
    expect(res?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { level: 1, name: "You don't have access to this page" }),
    ).toBeVisible();
    await shoot("loyalty-staff-403");
  });
});
