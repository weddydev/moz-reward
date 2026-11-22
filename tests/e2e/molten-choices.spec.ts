import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "./support/test";

/**
 * PD-05 (DESIGN §6.3, §7.4): coin switch, liquid choice and seal checkbox on the production build — the
 * behaviour the parity harness can't see (keyboard, rapid input, resize mid-pour, lite tier, reduced motion,
 * targets) and the screens for inspection. Pixel and motion parity: tests/parity.
 */
async function open(page: Page, path = "/dev/ui"): Promise<void> {
  await page.goto(path);
  // /dev/ui is long and can hydrate its segment after the root layout (C-20): wait for both.
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true", { timeout: 15_000 });
  await expect(page.locator("[data-hydrating]")).toHaveCount(0, { timeout: 15_000 });
}

/** A gallery block on /dev/ui (the preference toggles elsewhere on the page reuse names like "Sounds"). */
const block = (page: Page, name: string): Locator => page.locator(`[data-primitive="${name}"]`);

const reward = (page: Page): Locator =>
  page.getByRole("radiogroup", { name: "Choose your reward" }).first();
const blob = (group: Locator): Locator => group.locator(".m-blob");

/** Running Web Animations on an element (the pour, the drops). */
const running = (el: Locator): Promise<number> =>
  el.evaluate((n) => n.getAnimations().filter((a) => a.playState === "running").length);

/** The blob's resting geometry against the chosen option's box (both in the group's padding box). */
async function blobOn(group: Locator, name: string): Promise<{ dx: number; dw: number }> {
  return group.evaluate((g, label) => {
    const b = g.querySelector<HTMLElement>(".m-blob");
    const o = [...g.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) =>
      r.textContent.startsWith(label),
    );
    if (!b || !o) return { dx: Number.NaN, dw: Number.NaN };
    const x = new DOMMatrixReadOnly(getComputedStyle(b).transform).m41;
    return { dx: Math.abs(x - o.offsetLeft), dw: Math.abs(b.offsetWidth - o.offsetWidth) };
  }, name);
}

/**
 * Waits until the gold rests on option `name`: no pour running and the blob on the option's box. One read per
 * poll, so a runner that paints slowly after a load (Linux WebKit) can't pass the "no animation" check before
 * the last pour has begun and then read a mid-flight position.
 */
async function restsOn(group: Locator, name: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const at = await blobOn(group, name);
        return (await running(blob(group))) === 0 && at.dx < 1 && at.dw < 1;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

test("[PD-05] keyboard: Space toggles the coin switch and the seal checkbox; focus is visible", async ({
  page,
}) => {
  await open(page);
  const sw = block(page, "Switch").getByRole("switch", { name: "Birthday treat reminders" });
  const before = await sw.getAttribute("aria-checked");
  await sw.focus();
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  await page.keyboard.press("Space");
  await expect(sw).toHaveAttribute("aria-checked", before ?? "false");

  const box = page.getByRole("checkbox", { name: "Email me offers" });
  const was = await box.isChecked();
  await box.focus();
  // The ring sits on the drawn box (the native input is invisible).
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(box).toBeFocused();
  const ring = box.locator("xpath=following-sibling::span[contains(@class,'m-box')]");
  await expect(ring).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Space");
  expect(await box.isChecked()).toBe(!was);
});

test("[PD-05] keyboard: arrow keys pour the liquid choice, wrap and skip the disabled option; one tab stop", async ({
  page,
}) => {
  await open(page);
  const group = reward(page);
  const coffee = group.getByRole("radio", { name: /^Coffee/ });
  const cake = group.getByRole("radio", { name: /^Cake/ });
  // Roving tabindex: exactly one option is in the tab order.
  expect(await group.locator('[role="radio"][tabindex="0"]').count()).toBe(1);
  await coffee.click();
  await expect(coffee).toHaveAttribute("aria-checked", "true");
  await coffee.focus();
  await page.keyboard.press("ArrowRight");
  await expect(cake).toHaveAttribute("aria-checked", "true");
  await expect(cake).toBeFocused();
  // "Both" is disabled: Right from Cake wraps to Coffee.
  await page.keyboard.press("ArrowRight");
  await expect(coffee).toHaveAttribute("aria-checked", "true");
  await expect(coffee).toBeFocused();
  // Left from Coffee wraps backwards past "Both" to Cake.
  await page.keyboard.press("ArrowLeft");
  await expect(cake).toHaveAttribute("aria-checked", "true");
  expect(await group.locator('[role="radio"][tabindex="0"]').count()).toBe(1);
  await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveText(/^Cake/);
  // The gold comes to rest on the choice.
  await restsOn(group, "Cake");
});

test("[PD-05] rapid input retargets, never queues: the switch, the liquid choice and the checkbox end on the last press", async ({
  page,
}) => {
  await open(page);
  const sw = block(page, "Switch").getByRole("switch", { name: "Sounds" });
  const start = await sw.getAttribute("aria-checked");
  for (let i = 0; i < 5; i++) await sw.click();
  // Odd number of presses: the opposite state, and the coin has one transition at most (CSS retargets).
  await expect(sw).toHaveAttribute("aria-checked", start === "true" ? "false" : "true");
  expect(await running(sw.locator(".m-tgl-coin"))).toBeLessThanOrEqual(1);

  const group = reward(page);
  const coffee = group.getByRole("radio", { name: /^Coffee/ });
  const cake = group.getByRole("radio", { name: /^Cake/ });
  await coffee.click();
  await restsOn(group, "Coffee");
  // Cake, Coffee, Cake inside one task: each pour cancels the last.
  await group.evaluate((g) => {
    const [c, k] = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    k?.click();
    c?.click();
    k?.click();
  });
  await expect(cake).toHaveAttribute("aria-checked", "true");
  expect(await running(blob(group))).toBeLessThanOrEqual(1);
  await restsOn(group, "Cake");

  const box = page.getByRole("checkbox", { name: "Email me offers" });
  const was = await box.isChecked();
  for (let i = 0; i < 4; i++) await box.click();
  expect(await box.isChecked()).toBe(was);
});

test("[PD-05] a second choice mid-pour carries on from the gold's current shape (stretch kept)", async ({
  page,
}) => {
  await open(page);
  const group = reward(page);
  await group.getByRole("radio", { name: /^Coffee/ }).click();
  await restsOn(group, "Coffee");
  // Start the pour to Cake, hold it at the stretch beat, read the shape, choose Coffee again and read the new
  // pour's first keyframe. React commits the pour just after the click, so each step waits for its animation
  // (polled with timers, not frames); the held pour is paused, so no frame timing is involved.
  const r = await group.evaluate(async (g) => {
    const [coffee, cake] = [...g.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const b = g.querySelector<HTMLElement>(".m-blob");
    if (!coffee || !cake || !b) return null;
    const until = async <T>(get: () => T | undefined): Promise<T | undefined> => {
      for (let i = 0; i < 100; i++) {
        const v = get();
        if (v !== undefined) return v;
        await new Promise((res) => setTimeout(res, 10));
      }
      return undefined;
    };
    cake.click();
    const pour = await until(() => b.getAnimations()[0]);
    if (!pour) return null;
    pour.pause();
    // The effect's easing (.45,0,.2,1) reaches the 42% stretch keyframe at about 34% of the time.
    pour.currentTime = 660 * 0.34;
    const held = getComputedStyle(b).transform;
    coffee.click();
    const next = await until(() => b.getAnimations().find((a) => a !== pour));
    const first = (next?.effect as KeyframeEffect | null)?.getKeyframes()[0]?.transform;
    return {
      held,
      first: typeof first === "string" ? first : null,
      count: b.getAnimations().length,
    };
  });
  expect(r).not.toBeNull();
  expect(r?.count).toBe(1); // the old pour is gone, not queued
  expect(r?.first).toBe(r?.held);
  // Held at the stretch beat: close to 1.3 × .76, far from round.
  const m = /^matrix\(([^,]+), [^,]+, [^,]+, ([^,]+),/.exec(r?.held ?? "");
  expect(Number(m?.[1])).toBeGreaterThan(1.2);
  expect(Number(m?.[2])).toBeLessThan(0.85);
  await expect(group.getByRole("radio", { name: /^Coffee/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("[PD-05] a resize mid-pour snaps the gold to the choice's new box", async ({ page }) => {
  test.skip(
    test.info().project.name !== "desktop1440" && test.info().project.name !== "chromium",
    "viewport resize: desktop projects",
  );
  await open(page);
  const group = reward(page);
  await group.getByRole("radio", { name: /^Coffee/ }).click();
  await restsOn(group, "Coffee");
  await group.getByRole("radio", { name: /^Cake/ }).click();
  await page.setViewportSize({ width: 360, height: 800 });
  await restsOn(group, "Cake");
});

test("[PD-05] lite tier: no goo filter and no droplets; the blob still pours", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    document.documentElement.classList.add("lite");
  });
  const group = reward(page);
  await expect(group.locator(".m-goo")).toHaveCSS("filter", "none");
  for (const d of await group.locator(".m-drop").all()) await expect(d).toBeHidden();
  await group.getByRole("radio", { name: /^Coffee/ }).click();
  await restsOn(group, "Coffee");
  // Full tier: the filter is the shared one from the root layout (defined once).
  await page.evaluate(() => {
    document.documentElement.classList.remove("lite");
  });
  await expect(group.locator(".m-goo")).toHaveCSS("filter", /url\("?#m-goo"?\)/);
  expect(await page.locator("filter#m-goo").count()).toBe(1);
});

test("[PD-05] reduced motion: the gold moves at once, the seal has no pop, ring or sparks", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  const group = reward(page);
  const target =
    (await group.getByRole("radio", { name: /^Coffee/ }).getAttribute("aria-checked")) === "true"
      ? "Cake"
      : "Coffee";
  await group.getByRole("radio", { name: new RegExp(`^${target}`) }).click();
  // Placed in the same task as the click: no pour, no drops.
  expect(await running(blob(group))).toBe(0);
  expect((await blobOn(group, target)).dx).toBeLessThan(1);
  for (const d of await group.locator(".m-drop").all()) expect(await running(d)).toBe(0);

  const box = page.getByRole("checkbox", { name: "Email me offers" });
  if (await box.isChecked()) await box.click();
  await box.click();
  expect(await box.isChecked()).toBe(true);
  const sealBox = box.locator("xpath=following-sibling::span[contains(@class,'m-box')]");
  expect(await running(sealBox)).toBe(0);
  await expect(sealBox).not.toHaveClass(/(^|\s)burst(\s|$)/);
});

test("[PD-05] targets ≥ 44 px: switch, options and checkbox rows; form values unchanged", async ({
  page,
}) => {
  await open(page);
  const targets = [
    // The switch's target is its whole row (the button's ::after covers `.m-trow`).
    ...(await page.locator(".m-trow").filter({ visible: true }).all()),
    ...(await page.locator(".m-opt").filter({ visible: true }).all()),
    ...(await page.locator(".m-chk").filter({ visible: true }).all()),
  ];
  expect(targets.length).toBeGreaterThan(10);
  for (const [i, t] of targets.entries()) {
    const b = await t.boundingBox();
    expect(b?.height ?? 0, `target ${String(i)}`).toBeGreaterThanOrEqual(44);
    expect(b?.width ?? 0, `target ${String(i)}`).toBeGreaterThanOrEqual(44);
  }
  // A card group posts its value under the same name (form values unchanged): the hidden input follows the choice.
  const field = page.locator('input[type="hidden"][name="plan-cards"]');
  await expect(field).toHaveValue("monthly");
  const plan = page.getByRole("radiogroup", { name: "Plan (cards)" });
  await plan.getByRole("radio", { name: /^Yearly/ }).click();
  await expect(field).toHaveValue("yearly");
});

test("[PD-05] /dev/molten tiles at 320, 390 and 1440: no horizontal scroll (screens for inspection)", async ({
  page,
  shoot,
}) => {
  test.skip(
    !["chromium", "webkit"].includes(test.info().project.name),
    "inspection screens: one project per engine",
  );
  await open(page, "/dev/molten");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `/dev/molten at ${String(width)}`).toBeLessThanOrEqual(0);
    for (const tile of ["coin-switch-tile", "liquid-choice-tile", "seal-checkbox-tile"]) {
      await page.locator(`[data-parity="${tile}"]`).scrollIntoViewIfNeeded();
      await shoot(`molten-${tile}-${String(width)}`, { fullPage: false });
    }
  }
});
