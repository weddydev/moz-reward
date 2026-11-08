import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("UI gallery renders every primitive with no serious accessibility violations", async ({
  page,
}, info) => {
  await page.goto("/dev/ui");
  await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Collect points" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Requests" })).toBeVisible();

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

  await page.getByRole("button", { name: "Success toast" }).click();
  await expect(page.getByText("+80 gold added")).toBeVisible();

  if (process.env.SCREENSHOT_DIR) {
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/ui-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
