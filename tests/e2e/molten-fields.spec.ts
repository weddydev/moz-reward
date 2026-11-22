import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * PD-06 (DESIGN §6.3, §7.4): tabs, text field, star rating, slider and member card on the production build —
 * the behaviour the parity harness can't see (keyboard, rapid input, overflow, reduced motion, targets) and the
 * screens for inspection. Pixel and motion parity: tests/parity.
 */
// /dev/ui and /dev/molten are long: same limit as the other gallery specs (the guard's closing axe scan).
test.describe.configure({ timeout: 60_000 });

async function open(page: Page, path = "/dev/molten"): Promise<void> {
  await page.goto(path);
  // The gallery can hydrate its segment after the root layout (C-20): wait for both.
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 15_000 });
  await expect(page.locator("[data-hydrating]")).toHaveCount(0, { timeout: 15_000 });
}

const sections = (page: Page): Locator => page.getByRole("tablist", { name: "Sections" });

/** The pill's box against the chosen tab's box, once both transitions have settled. */
async function pillOn(list: Locator): Promise<number> {
  return list.evaluate((l) => {
    const ind = l.querySelector<HTMLElement>(".m-seg-ind");
    const tab = l.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!ind || !tab) return Number.NaN;
    const a = ind.getBoundingClientRect();
    const b = tab.getBoundingClientRect();
    return Math.max(Math.abs(a.left - b.left), Math.abs(a.width - b.width));
  });
}

const running = (el: Locator): Promise<number> =>
  el.evaluate((n) => n.getAnimations().filter((a) => a.playState === "running").length);

test("[PD-06] tabs keyboard: arrows wrap and move focus, Home/End jump, one tab stop, the number counts up", async ({
  page,
}) => {
  await open(page);
  const list = sections(page);
  const tab = (name: string): Locator => list.getByRole("tab", { name });
  await tab("Wallet").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Market")).toBeFocused();
  await expect(tab("Market")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Wallet")).toBeFocused();
  await page.keyboard.press("End");
  await expect(tab("Market")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(tab("Offers")).toHaveAttribute("aria-selected", "true");
  await expect(list.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  // The panel's number ends on its value; the moving digits are hidden, the read copy is still.
  const panel = page.getByRole("tabpanel").filter({ hasText: "live drops near Camden" });
  await expect(panel.locator('[aria-hidden="true"]')).toHaveText("12");
  await expect(panel.locator(".sr-only")).toHaveText("12");
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(1);
  // Tab moves out of the tablist to the panel (focusable), not to the next tab.
  await page.keyboard.press("Tab");
  await expect(panel).toBeFocused();
});

test("[PD-06] tabs rapid switching retargets, never queues: the pill and panel end on the last tab", async ({
  page,
}) => {
  await open(page);
  const list = sections(page);
  for (const name of ["Offers", "Market", "Wallet", "Market"])
    await list.getByRole("tab", { name }).click();
  await expect(list.getByRole("tab", { name: "Market" })).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel").filter({ hasText: "new listings this week" });
  // At most one slide at a time on the panel.
  expect(await running(panel)).toBeLessThanOrEqual(1);
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(1);
  await expect(panel.locator('[aria-hidden="true"]')).toHaveText("48");
});

test("[PD-06] many tabs scroll inside their own row and keep the chosen one in view; equal columns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page, "/dev/ui");
  const list = page.getByRole("tablist", { name: "All requests" });
  const row = list.locator("xpath=..");
  const sizes = await list
    .getByRole("tab")
    .evaluateAll((tabs) => tabs.map((t) => Math.round(t.getBoundingClientRect().width)));
  expect(new Set(sizes).size, `equal columns: ${sizes.join(",")}`).toBe(1);
  expect(await row.evaluate((r) => r.scrollWidth > r.clientWidth)).toBe(true);
  const last = list.getByRole("tab", { name: "Refunded" });
  await list.getByRole("tab", { name: /^All/ }).focus();
  await page.keyboard.press("End");
  await expect(last).toHaveAttribute("aria-selected", "true");
  const inView = (): Promise<boolean> =>
    last.evaluate((t) => {
      const r = t.getBoundingClientRect();
      const box = (t.closest(".m-seg-scroll") as HTMLElement).getBoundingClientRect();
      return r.left >= box.left - 1 && r.right <= box.right + 1;
    });
  await expect.poll(inView).toBe(true);
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(1);
  // The page itself never scrolls sideways.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("[PD-06] tabs under reduced motion: no slide, the number shows at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  const list = sections(page);
  await list.getByRole("tab", { name: "Market" }).click();
  const panel = page.getByRole("tabpanel").filter({ hasText: "new listings this week" });
  await expect(panel.locator('[aria-hidden="true"]')).toHaveText("48");
});

const emailField = (page: Page): Locator =>
  page.locator('[data-parity="text-field-tile"]').getByLabel("Email address");
const fieldBox = (input: Locator): Locator => input.locator("xpath=..");

test("[PD-06] text field: an empty submit shakes, turns the beam red, explains and refocuses; typing clears it", async ({
  page,
}) => {
  await open(page);
  const input = emailField(page);
  const send = page.getByRole("button", { name: "Send sign-in link" });
  await send.click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAccessibleDescription(
    "Enter your email address to get a sign-in link.",
  );
  await expect(fieldBox(input)).toHaveAttribute("data-state", "bad");
  await expect(input).toBeFocused();
  // The same error again (a second failed submit) shakes again.
  await send.click();
  expect(await running(fieldBox(input))).toBeGreaterThanOrEqual(1);
  // Typing clears the error.
  await input.fill("a");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await expect(fieldBox(input)).not.toHaveAttribute("data-state");
});

test("[PD-06] text field: a pasted invalid address says how to fix it; a good one draws the tick and rolls the label", async ({
  page,
}) => {
  await open(page);
  const input = emailField(page);
  await input.focus();
  // Pasted, not typed: the whole value arrives in one input event.
  await page.keyboard.insertText("aisha@example");
  await page.keyboard.press("Enter");
  await expect(input).toHaveAccessibleDescription(
    "That email looks incomplete. Check it has an @ and a domain, like name@example.co.uk.",
  );
  await input.fill("aisha@example.co.uk");
  await page.keyboard.press("Enter");
  await expect(fieldBox(input)).toHaveAttribute("data-state", "good");
  await expect(page.getByText("Sign-in link sent to aisha@example.co.uk.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Link sent" })).toBeVisible();
});

test("[PD-06] text field: the label floats on focus and with an autofilled value; the beam follows the tap point", async ({
  page,
}) => {
  await open(page);
  const input = emailField(page);
  const label = fieldBox(input).locator("label");
  const scale = (): Promise<number> =>
    label.evaluate((l) => new DOMMatrixReadOnly(getComputedStyle(l).transform).a);
  await expect.poll(scale).toBe(1);
  // A tap near the left edge: the beam's origin is there.
  await input.scrollIntoViewIfNeeded();
  const box = await input.boundingBox();
  if (!box) throw new Error("no field box");
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
  await expect(input).toBeFocused();
  const ox = await fieldBox(input).evaluate((f) => f.style.getPropertyValue("--ox"));
  expect(Number.parseFloat(ox)).toBeGreaterThan(15);
  expect(Number.parseFloat(ox)).toBeLessThan(25);
  await expect.poll(scale, { timeout: 5_000 }).toBeCloseTo(0.76, 2);
  // A value set without typing (what autofill does) keeps the label up after blur.
  await input.evaluate((el: HTMLInputElement) => {
    el.value = "aisha@example.co.uk";
    el.blur();
  });
  await expect.poll(scale, { timeout: 5_000 }).toBeCloseTo(0.76, 2);
});

test("[PD-06] targets ≥ 44 px: every tab and the text field", async ({ page }) => {
  await open(page);
  const tabs = await page.locator(".m-seg [role='tab']").filter({ visible: true }).all();
  expect(tabs.length).toBeGreaterThanOrEqual(3);
  for (const [i, t] of tabs.entries()) {
    const b = await t.boundingBox();
    expect(b?.height ?? 0, `tab ${String(i)}`).toBeGreaterThanOrEqual(44);
    expect(b?.width ?? 0, `tab ${String(i)}`).toBeGreaterThanOrEqual(44);
  }
  const field = await emailField(page).boundingBox();
  expect(field?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("[PD-06] /dev/molten PD-06 tiles at 320, 390 and 1440: no horizontal scroll (screens for inspection)", async ({
  page,
  shoot,
}) => {
  test.skip(
    !["chromium", "webkit"].includes(test.info().project.name),
    "inspection screens: one project per engine",
  );
  await open(page);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `/dev/molten at ${String(width)}`).toBeLessThanOrEqual(0);
    for (const tile of ["tabs-tile", "text-field-tile"]) {
      await page.locator(`[data-parity="${tile}"]`).scrollIntoViewIfNeeded();
      await shoot(`molten-${tile}-${String(width)}`, { fullPage: false });
    }
  }
});
