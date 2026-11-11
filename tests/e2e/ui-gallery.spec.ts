import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./support/test";

/**
 * Three focused tests rather than one: the axe scan, the full-page screenshot and the toast interaction are
 * independent, and together they used most of one test's budget under full parallel load on WebKit (a click
 * then ran out of time waiting for stability). Each now has its own budget and reports its own failure.
 */
test.describe("[P0-09] UI gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
  });

  test("[P0-09] renders every primitive with no page overflow and no serious accessibility violations", async ({
    page,
  }) => {
    await expect(page.getByRole("button", { name: "Collect points" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Requests" })).toBeVisible();
    // Scan the settled page: controls disabled until hydration fade from .55 to full opacity (120ms) once
    // enabled, and axe measures contrast mid-fade if it runs then.
    await expect(page.locator('[data-overlay-trigger="modal"]')).toBeEnabled();
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );

    // No horizontal page overflow (mobile browsers would zoom the whole page out).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    ).toEqual([]);
  });

  test("[P0-09] screenshot for visual inspection", async ({ shoot }) => {
    await shoot("ui-gallery");
  });

  test("[P0-09] a toast appears when triggered", async ({ page }) => {
    await page.getByRole("button", { name: "Success toast" }).click();
    await expect(
      page.getByRole("region", { name: "Notifications" }).getByText("+80 gold added"),
    ).toBeVisible();
    // Announced once through the polite live region, then cleared (not read twice).
    await expect(page.getByRole("status").filter({ hasText: "+80 gold added" })).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "+80 gold added" })).toHaveCount(0);
  });
});
