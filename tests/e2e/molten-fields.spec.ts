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

/**
 * How far the pill sits from the chosen tab (px): ≤ `PILL_PX` once its spring has settled. Not < 1: WebKit keeps
 * the settled pill on its compositing layer for a few seconds, snapped to the device pixel grid, so it reads up
 * to one pixel off a tab at a fractional position until it is painted back in place (measured 1.09 px on host
 * WebKit for the 6th tab at 320 px, then 0.08; CI 45061015313).
 */
const PILL_PX = 1.5;

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

/** Running animations on the element and everything inside it (the choices' pop and spring settle). */
const runningWithin = (el: Locator): Promise<number> =>
  el.evaluate(
    (n) => n.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
  );

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
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(PILL_PX);
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
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(PILL_PX);
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
  await expect.poll(() => pillOn(list), { timeout: 5_000 }).toBeLessThan(PILL_PX);
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
  // Clicked through the locator, so Playwright waits for the field to stop moving (the tile's rise, late
  // layout) before it picks the point; a raw mouse click at a box measured earlier could miss.
  const box = await input.boundingBox();
  if (!box) throw new Error("no field box");
  await input.click({ position: { x: box.width * 0.2, y: box.height / 2 } });
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

const rating = (page: Page): Locator => page.getByRole("radiogroup", { name: "Rate your visit" });
const rateTile = (page: Page): Locator => page.locator('[data-parity="stars-tile"]');
const litCount = (group: Locator): Promise<number> => group.locator(".m-star.lit").count();

/** What makes the two choices look alike: box size and every visible style, compared one to one. */
async function choiceLooks(tile: Locator): Promise<Array<Record<string, string>>> {
  return tile.locator(".m-rate-actions button").evaluateAll((buttons) =>
    buttons.map((b) => {
      const s = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return {
        w: r.width.toFixed(1),
        h: r.height.toFixed(1),
        bg: s.backgroundColor + s.backgroundImage,
        border: s.border,
        radius: s.borderRadius,
        color: s.color,
        font: `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`,
        opacity: s.opacity,
        transform: s.transform,
      };
    }),
  );
}

test("[PD-06] star rating keyboard: one tab stop, arrows move and choose without wrapping, the word follows", async ({
  page,
}) => {
  await open(page);
  const group = rating(page);
  const star = (n: number): Locator =>
    group.getByRole("radio", { name: n === 1 ? "1 star" : `${String(n)} stars` });
  await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await star(1).focus();
  await page.keyboard.press("ArrowLeft");
  // No wrap below 1: the first star is chosen and keeps focus.
  await expect(star(1)).toBeFocused();
  await expect(star(1)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(star(4)).toBeFocused();
  await expect(star(4)).toHaveAttribute("aria-checked", "true");
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
  await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await expect(rateTile(page).locator(".m-rate-txt")).toHaveText("Great");
  await expect.poll(() => litCount(group), { timeout: 5_000 }).toBe(4);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  // No wrap above 5.
  await expect(star(5)).toBeFocused();
  await expect(rateTile(page).locator(".m-rate-txt")).toHaveText("Outstanding");
  // Tab leaves the group for the first choice, which is now reachable.
  await page.keyboard.press("Tab");
  await expect(rateTile(page).getByRole("button", { name: "Post on Google" })).toBeFocused();
});

test("[PD-06] star rating rapid taps retarget, never queue: the stars end on the last tap", async ({
  page,
}) => {
  await open(page);
  const group = rating(page);
  await group.scrollIntoViewIfNeeded();
  for (const n of [5, 2, 4, 1, 3])
    await group.getByRole("radio", { name: n === 1 ? "1 star" : `${String(n)} stars` }).click();
  await expect(group.getByRole("radio", { name: "3 stars" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(group.locator('[aria-checked="true"]')).toHaveCount(1);
  await expect(rateTile(page).locator(".m-rate-txt")).toHaveText("Good");
  // The earlier taps' ignitions were cancelled: exactly three stay lit, then and after their time has passed.
  await expect.poll(() => litCount(group), { timeout: 5_000 }).toBe(3);
  // The word rises in after the last star (3 × 70 ms + 300 ms), past any 5-star ignition's 280 ms.
  await expect
    .poll(() => running(rateTile(page).locator(".m-rate-txt")), { timeout: 5_000 })
    .toBe(0);
  expect(await litCount(group)).toBe(3);
});

test("[PD-06] star rating never gates reviews: before a rating the choices are inert; after ANY rating both are there, identical (COMPLIANCE §1)", async ({
  page,
}) => {
  await open(page);
  const tile = rateTile(page);
  const group = rating(page);
  const actions = tile.locator(".m-rate-actions");
  // Before a rating: space held, nothing reachable.
  await expect(actions).toHaveAttribute("inert", "");
  await expect(tile.locator(".m-rate-actions button")).toHaveText([
    "Post on Google",
    "Send privately",
  ]);
  let first: Array<Record<string, string>> | undefined;
  for (const n of [1, 5, 2, 4, 3]) {
    await group.getByRole("radio", { name: n === 1 ? "1 star" : `${String(n)} stars` }).click();
    await expect(actions).not.toHaveAttribute("inert");
    const google = tile.getByRole("button", { name: "Post on Google" });
    const privately = tile.getByRole("button", { name: "Send privately" });
    await expect(google).toBeVisible();
    await expect(privately).toBeVisible();
    await expect(google).toBeEnabled();
    await expect(privately).toBeEnabled();
    // Same two, same order, whatever the rating.
    await expect(tile.locator(".m-rate-actions button")).toHaveText([
      "Post on Google",
      "Send privately",
    ]);
    // Once the pop-in has settled (spring overshoot included), the two look exactly alike, and alike for
    // every rating. Both must end fully shown and in place; polled, not read once: Linux WebKit starved of
    // frames (about 1 a second in a container) reports the pop finished while the computed style still holds
    // the last frame drawn (CI 45068046655: "Send privately" at 0 or .98 with nothing running).
    await expect.poll(() => runningWithin(actions), { timeout: 5_000 }).toBe(0);
    const atRest = (t: string | undefined): boolean =>
      t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)";
    await expect
      .poll(
        async () =>
          (await choiceLooks(tile)).map(
            (l) => `${l.opacity ?? ""} ${atRest(l.transform) ? "in place" : (l.transform ?? "")}`,
          ),
        { timeout: 5_000 },
      )
      .toEqual(["1 in place", "1 in place"]);
    const looks = await choiceLooks(tile);
    expect(looks[1], `rating ${String(n)}: the two choices differ`).toEqual(looks[0]);
    first ??= looks;
    expect(looks, `rating ${String(n)} looks unlike rating 1`).toEqual(first);
  }
});

test("[PD-06] star rating under reduced motion: every star lights at once, no pop", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  const group = rating(page);
  await group.getByRole("radio", { name: "5 stars" }).click();
  // All five at once (no 70 ms stagger), with no pop running on any star.
  await expect.poll(() => litCount(group), { timeout: 500 }).toBe(5);
  for (const s of await group.locator(".m-star").all()) expect(await running(s)).toBe(0);
  await expect(rateTile(page).getByRole("button", { name: "Post on Google" })).toBeVisible();
  await expect(rateTile(page).getByRole("button", { name: "Send privately" })).toBeVisible();
});

test("[PD-06] targets ≥ 44 px: every tab, the text field, each star and both rating choices", async ({
  page,
}) => {
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
  // Measured at rest: the tile's scroll-driven rise scales everything inside it until it is in view.
  await rateTile(page).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        rateTile(page).evaluate(
          (t) => new DOMMatrixReadOnly(getComputedStyle(t).transform).isIdentity,
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
  const stars = await rating(page).getByRole("radio").all();
  expect(stars).toHaveLength(5);
  for (const [i, st] of stars.entries()) {
    const b = await st.boundingBox();
    expect(b?.height ?? 0, `star ${String(i + 1)}`).toBeGreaterThanOrEqual(44);
    expect(b?.width ?? 0, `star ${String(i + 1)}`).toBeGreaterThanOrEqual(44);
  }
  for (const choice of await rateTile(page).locator(".m-rate-actions button").all()) {
    const b = await choice.boundingBox();
    expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});

const sliderTile = (page: Page): Locator => page.locator('[data-parity="slider-tile"]');
const spend = (page: Page): Locator =>
  sliderTile(page).getByRole("slider", { name: "Gold to spend" });
/** Every notch the thumb has crossed so far, in order (the gallery's record of `onNotch`). */
const notchLog = async (page: Page): Promise<string> =>
  (await sliderTile(page).getAttribute("data-notches")) ?? "";

/** The tile at rest: its scroll-driven rise scales everything inside it until it is in view. */
async function sliderAtRest(page: Page): Promise<void> {
  await sliderTile(page).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        sliderTile(page).evaluate(
          (t) => new DOMMatrixReadOnly(getComputedStyle(t).transform).isIdentity,
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
}

/** The bubble's lean in degrees, as drawn (its computed transform's rotation). */
const lean = (page: Page): Promise<number> =>
  sliderTile(page)
    .locator(".m-bubble")
    .evaluate((b) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(b).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    });

/** What the drag test records in the page (see "slider drag"). */
type LeanProbe = {
  __tilts: number[];
  __minLean: number;
  __leanFrames: number[];
  __leanRaf: number;
  __tiltObs: MutationObserver;
};

test("[PD-06] slider keyboard: arrows step 10, Home/End and Page keys jump; each notch sparks once per crossing", async ({
  page,
}) => {
  await open(page);
  const input = spend(page);
  await expect(input).toHaveValue("240");
  await expect(input).toHaveAttribute("aria-valuetext", "240 of 720 gold");
  await input.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(input).toHaveValue("230");
  // Up across Pastry one step at a time: one spark at 240, none for the steps past it.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await expect(input).toHaveValue("260");
  await expect.poll(() => notchLog(page)).toBe("240");
  // Back below the notch and over it again: it sparks again (a new crossing).
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect(input).toHaveValue("240");
  await expect.poll(() => notchLog(page)).toBe("240 240");
  await page.keyboard.press("Home");
  await expect(input).toHaveValue("0");
  // End crosses three notches in one jump: each sparks once, in order.
  await page.keyboard.press("End");
  await expect(input).toHaveValue("720");
  await expect.poll(() => notchLog(page)).toBe("240 240 240 480 720");
  await expect(sliderTile(page).locator(".m-bubble")).toHaveText("720");
  await expect(sliderTile(page).locator(".m-sl-out")).toHaveText("Spend 720 of 720 gold");
  await expect(input).toHaveAttribute("aria-valuetext", "720 of 720 gold");
  await expect(sliderTile(page).locator(".m-ticks .hit")).toHaveText([
    "Pastry",
    "Coffee",
    "All 720",
  ]);
  // Page keys move further than one step, stay on the step, and spark nothing going down.
  await page.keyboard.press("PageDown");
  const down = Number(await input.inputValue());
  expect(down).toBeLessThan(710);
  expect(down % 10).toBe(0);
  await page.keyboard.press("PageUp");
  await expect(input).toHaveValue("720");
  await expect.poll(() => notchLog(page)).toBe("240 240 240 480 720 720");
});

test("[PD-06] slider drag: the coin follows the pointer, the fill grows, the bubble leans and springs back upright", async ({
  page,
  isMobile,
  browserName,
}) => {
  test.skip(isMobile, "a mouse drag; touch drags are the browser's own range input");
  await open(page);
  await sliderAtRest(page);
  // The pointer rests on the coin, over the input and where it was measured, before the press (C-77): Linux
  // WebKit scrolls the page back (39 px) at the first mouse event after `scrollIntoViewIfNeeded`, so a box read
  // before it sent the press onto the wrapper above the input and the value never moved (2 in 6 runs).
  let measured: { x: number; y: number; width: number; height: number } | null = null;
  await expect
    .poll(
      async () => {
        measured = await spend(page).boundingBox();
        if (!measured) return false;
        const at = { x: measured.x + 18 + (240 / 720) * (measured.width - 36), y: measured.y + 32 };
        await page.mouse.move(at.x, at.y);
        const top = measured.y;
        return spend(page).evaluate(
          (n, p) =>
            document.elementFromPoint(p.x, p.y) === n &&
            Math.abs(n.getBoundingClientRect().top - p.top) < 0.5,
          { ...at, top },
        );
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  const box = measured as { x: number; y: number; width: number; height: number } | null;
  if (!box) throw new Error("no slider box");
  const coinX = (v: number): number => box.x + 18 + (v / 720) * (box.width - 36);
  const y = box.y + 32;
  // Recorded in the page: every lean the slider asks for (each write of the bubble's `--tilt`) and, on every
  // frame, the lean drawn and the frames that ran while a lean was asked for. Read afterwards, the bubble may
  // already be upright again (90 ms after the last input, then .5 s), which a slow runner's round trips outlast.
  // What was drawn is judged by frames, not wall-clock time (C-77): Linux WebKit in CI and in a container runs
  // no frame at all for the whole drag and its 90 ms settle, so the spring never starts there and nothing can be
  // seen to lean; it is checked wherever frames ran, the asked-for lean everywhere.
  await sliderTile(page)
    .locator(".m-bubble")
    .evaluate((b) => {
      const w = window as unknown as LeanProbe;
      const tilt = (): number => Number.parseFloat(b.style.getPropertyValue("--tilt")) || 0;
      w.__tilts = [];
      w.__minLean = 0;
      w.__leanFrames = [];
      w.__tiltObs = new MutationObserver(() => {
        w.__tilts.push(tilt());
      });
      w.__tiltObs.observe(b, { attributes: true, attributeFilter: ["style"] });
      const tick = (t: number): void => {
        if (tilt() < 0) w.__leanFrames.push(t);
        const m = new DOMMatrixReadOnly(getComputedStyle(b).transform);
        w.__minLean = Math.min(w.__minLean, (Math.atan2(m.b, m.a) * 180) / Math.PI);
        w.__leanRaf = requestAnimationFrame(tick);
      };
      w.__leanRaf = requestAnimationFrame(tick);
    });
  const probe = (): Promise<LeanProbe> =>
    page.evaluate(() => {
      const w = window as unknown as LeanProbe;
      return {
        __tilts: w.__tilts,
        __minLean: w.__minLean,
        __leanFrames: w.__leanFrames,
      } as LeanProbe;
    });
  await page.mouse.move(coinX(240), y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(coinX(240 + i * 40), y);
  // Mid-drag the value follows the pointer and the slider leans the bubble back against the movement; held
  // still, it asks for upright again (the 90 ms settle).
  await expect(spend(page)).not.toHaveValue("240");
  await expect
    .poll(async () => Math.min(...(await probe()).__tilts), { timeout: 2_000 })
    .toBeLessThan(-1);
  await expect.poll(async () => (await probe()).__tilts.at(-1), { timeout: 2_000 }).toBe(0);
  const seen = await probe();
  await page.evaluate(() => {
    const w = window as unknown as LeanProbe;
    cancelAnimationFrame(w.__leanRaf);
    w.__tiltObs.disconnect();
  });
  // Drawn: wherever frames ran across 32 ms or more of the lean, the bubble was seen leaning.
  const leanSpanMs = (seen.__leanFrames.at(-1) ?? 0) - (seen.__leanFrames[0] ?? 0);
  if (leanSpanMs >= 32)
    expect(seen.__minLean, `frames over ${String(leanSpanMs)} ms`).toBeLessThan(-1);
  if (browserName === "chromium") expect(leanSpanMs).toBeGreaterThanOrEqual(32);
  await page.mouse.move(box.x + box.width + 20, y);
  await page.mouse.up();
  await expect(spend(page)).toHaveValue("720");
  await expect.poll(() => notchLog(page)).toBe("480 720");
  // The coin sits at the end of the track and the fill is full.
  const coin = await sliderTile(page).locator(".m-sl-thumb").boundingBox();
  expect(Math.abs((coin?.x ?? 0) + 18 - coinX(720))).toBeLessThanOrEqual(1);
  const fill = await sliderTile(page)
    .locator(".m-sl-fill")
    .evaluate((f) => new DOMMatrixReadOnly(getComputedStyle(f).transform).a);
  expect(fill).toBeCloseTo(1, 3);
  // Upright again once input stops (90 ms, then the .5 s spring).
  await expect.poll(() => lean(page).then(Math.abs), { timeout: 3_000 }).toBeLessThan(0.5);
  // A press anywhere on the track jumps there.
  await page.mouse.click(coinX(0), y);
  await expect(spend(page)).toHaveValue("0");
});

test("[PD-06] slider rapid input never queues: 40 quick steps end on the last value, each notch once", async ({
  page,
}) => {
  await open(page);
  const input = spend(page);
  await input.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight", { delay: 0 });
  await expect(input).toHaveValue("400");
  await expect(sliderTile(page).locator(".m-bubble")).toHaveText("400");
  await expect.poll(() => notchLog(page)).toBe("240");
  await expect.poll(() => lean(page).then(Math.abs), { timeout: 3_000 }).toBeLessThan(0.5);
});

test("[PD-06] slider under reduced motion: the value moves, the bubble never leans", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  const input = spend(page);
  await input.focus();
  await page.keyboard.press("End");
  await expect(input).toHaveValue("720");
  await expect(sliderTile(page).locator(".m-bubble")).toHaveText("720");
  expect(
    await sliderTile(page)
      .locator(".m-bubble")
      .evaluate((b) => b.style.getPropertyValue("--tilt")),
  ).toBe("");
  expect(Math.abs(await lean(page))).toBeLessThan(0.01);
  // The glint runs once to its end and stops (no endless loop).
  await expect
    .poll(() =>
      sliderTile(page)
        .locator(".m-sl-fill")
        .evaluate(
          (f) => f.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
        ),
    )
    .toBe(0);
});

test("[PD-06] slider target ≥ 44 px, keyboard focus ring on the coin", async ({ page }) => {
  await open(page);
  await sliderAtRest(page);
  const b = await spend(page).boundingBox();
  expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Tab");
  await spend(page).focus();
  const ring = await sliderTile(page)
    .locator(".m-sl-thumb")
    .evaluate((t) => {
      const cs = getComputedStyle(t);
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`;
    });
  expect(ring).toBe("solid 2px 3px");
});

const cardTile = (page: Page): Locator => page.locator('[data-parity="member-card-tile"]');
const memberCard = (page: Page): Locator => page.locator('[data-parity="member-card"]');

/** The tile at rest (its scroll-driven rise done) and the card's own motion settled. */
async function cardAtRest(page: Page): Promise<void> {
  await cardTile(page).scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        cardTile(page).evaluate(
          (t) => new DOMMatrixReadOnly(getComputedStyle(t).transform).isIdentity,
        ),
      { timeout: 5_000 },
    )
    .toBe(true);
}

/** The card's turn and lean as drawn: y rotation from its matrix (0 front, 180 back), x lean, both in degrees. */
const cardAngles = (page: Page): Promise<{ ry: number; rx: number }> =>
  memberCard(page).evaluate((c) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(c).transform);
    const deg = (r: number): number => (r * 180) / Math.PI;
    // rotateX(a) rotateY(b) = [[cos b, 0, sin b], [sin a sin b, cos a, −sin a cos b], [−cos a sin b, sin a, cos a
    // cos b]] (rows); DOMMatrix mCR is column C, row R. Exact for any turn (180 when on its back).
    const ry = deg(Math.atan2(m.m31, m.m11));
    return { ry: ry < -90 ? ry + 360 : ry, rx: deg(Math.atan2(m.m23, m.m22)) };
  });

/**
 * A tap or click at the card's centre, as a person makes it: on touch-only screens the card sways (an endless
 * animation), so Playwright's "stable" wait on `locator.click()` would never end; the centre barely moves.
 */
async function tapCard(page: Page, hasTouch: boolean): Promise<void> {
  const b = await memberCard(page).boundingBox();
  if (!b) throw new Error("no card box");
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * Which face a person sees at the card's centre (hit testing skips a hidden face), and whether the face turned
 * away is hidden too (not only by `backface-visibility`, which an engine drawing the card flat ignores).
 */
const shownFace = (page: Page): Promise<{ hit: string; awayHidden: boolean }> =>
  memberCard(page).evaluate((c) => {
    const r = c.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const faceOf = (el: Element | null): string => {
      const f = el?.closest(".m-mface");
      return f ? (f.classList.contains("m-back") ? "back" : "front") : "none";
    };
    const away = c.querySelector(
      c.dataset.face === "back" ? ".m-mface:not(.m-back)" : ".m-mface.m-back",
    );
    return {
      hit: faceOf(hit),
      awayHidden: !!away && getComputedStyle(away).visibility === "hidden",
    };
  });

/**
 * Settled on a face: no running transition or animation on the card, turned to `face`, and only that face can be
 * seen. The angle is polled, not read once: Linux WebKit starved of frames reports the transition finished while
 * its computed transform still holds the last frame's value (CI 45068046655: 0.55° short of 180).
 */
async function settledOn(page: Page, face: "front" | "back"): Promise<void> {
  await expect(memberCard(page)).toHaveAttribute("data-face", face);
  await expect.poll(() => running(memberCard(page)), { timeout: 5_000 }).toBe(0);
  const target = face === "back" ? 180 : 0;
  await expect
    .poll(async () => Math.abs((await cardAngles(page)).ry - target), { timeout: 5_000 })
    .toBeLessThan(0.5);
  await expect
    .poll(() => shownFace(page), { timeout: 5_000 })
    .toEqual({ hit: face, awayHidden: true });
}

test("[PD-06] member card: a click, Enter and Space turn it to the QR placeholder and back; the name says which side", async ({
  page,
  hasTouch,
}) => {
  await open(page);
  await cardAtRest(page);
  const card = memberCard(page);
  await expect(card).toHaveAttribute("role", "button");
  await expect(card).toHaveAccessibleName(
    "Member card: Aisha Khan, K7Q-42M. Press to show QR code",
  );
  // Unturned, the front is what shows and the back is hidden, on every engine (design review 23 Nov: Playwright
  // WebKit drew the back over the front, mirrored, where it draws the card flat).
  await expect
    .poll(() => shownFace(page), { timeout: 5_000 })
    .toEqual({ hit: "front", awayHidden: true });
  await expect(card.locator(".m-mface.m-back")).toBeHidden();
  await tapCard(page, hasTouch);
  await settledOn(page, "back");
  await expect(card.locator(".m-mface:not(.m-back)")).toBeHidden();
  await expect(card.locator(".m-mface.m-back")).toBeVisible();
  await expect(card.locator(".m-mc-note")).toHaveText("Show this at the till · K7Q-42M");
  await expect(card).toHaveAccessibleName(
    "Member card showing a QR code placeholder. Press to turn back",
  );
  // The back holds the labelled placeholder, drawn (the reference's pattern: ink cells on white).
  const qr = card.locator('canvas[aria-label="QR code placeholder"]');
  await expect(qr).toHaveCount(1);
  const inked = await qr.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? [];
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if ((d[i] ?? 0) > 0) n++;
    return n;
  });
  expect(inked).toBeGreaterThan(200);
  // Keyboard: focus it, Enter turns it back, Space turns it over again without scrolling the page.
  await card.focus();
  await page.keyboard.press("Enter");
  await settledOn(page, "front");
  const y = await page.evaluate(() => window.scrollY);
  await page.keyboard.press("Space");
  await settledOn(page, "back");
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  // Its focus ring (DESIGN §13).
  const ring = await card.evaluate((c) => {
    const cs = getComputedStyle(c);
    return `${cs.outlineStyle} ${cs.outlineWidth}`;
  });
  expect(ring).toBe("solid 2px");
});

test("[PD-06] member card rapid flips retarget, never queue: it ends on the side the count says", async ({
  page,
  hasTouch,
}) => {
  await open(page);
  await cardAtRest(page);
  const card = memberCard(page);
  for (let i = 0; i < 5; i++) await tapCard(page, hasTouch);
  await settledOn(page, "back");
  await card.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Enter", { delay: 0 });
  await settledOn(page, "back");
});

test("[PD-06] member card: a mouse tilts it and lights the glare; leaving fast springs it back upright", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "a mouse over the card; touch screens sway instead (next test)");
  await open(page);
  await cardAtRest(page);
  const box = await memberCard(page).boundingBox();
  if (!box) throw new Error("no card box");
  // Up and to the right (80% across, 20% down; well inside, so the leaning card stays under the pointer): the
  // top comes towards it, (.5 − .2) × 22 = 6.6°, and the right side, (.8 − .5) × 26 = 7.8°.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2, { steps: 4 });
  await expect(memberCard(page)).toHaveClass(/\blive\b/);
  await expect
    .poll(async () => (await cardAngles(page)).ry, { timeout: 2_000 })
    .toBeGreaterThan(6.5);
  await expect.poll(() => running(memberCard(page)), { timeout: 2_000 }).toBe(0);
  const tilted = await cardAngles(page);
  // The pointer is read on the leaning card's box, so the angles land near, not exactly on, 6.6° and 7.8°.
  expect(tilted.rx).toBeGreaterThan(5);
  expect(tilted.rx).toBeLessThanOrEqual(11.01);
  expect(tilted.ry).toBeLessThanOrEqual(13.01);
  await expect
    .poll(() =>
      memberCard(page)
        .locator(".m-glare")
        .first()
        .evaluate((g) => getComputedStyle(g).opacity),
    )
    .toBe("1");
  // Out in one jump (a fast exit): it springs back upright and the glare fades.
  await page.mouse.move(box.x + box.width + 300, box.y - 200);
  await expect(memberCard(page)).not.toHaveClass(/\blive\b/);
  await expect.poll(() => running(memberCard(page)), { timeout: 5_000 }).toBe(0);
  // Polled: frame-starved Linux WebKit reports the spring done while the drawn angle is the last frame's.
  await expect
    .poll(
      async () => {
        const rest = await cardAngles(page);
        return Math.abs(rest.rx) + Math.abs(rest.ry);
      },
      { timeout: 5_000 },
    )
    .toBeLessThan(0.5);
  // A fine pointer never sways.
  await expect(memberCard(page)).not.toHaveClass(/\bidle\b/);
});

test("[PD-06] member card idle sway: only on touch-only screens, never on iOS, never while turned over", async ({
  page,
  hasTouch,
}) => {
  await open(page);
  await cardAtRest(page);
  const fine = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
  // iOS (the iphone14 project, an iPhone user agent): no tilt and no sway (DESIGN §6).
  const ios = /\b(iPhone|iPad|iPod)\b/.test(await page.evaluate(() => navigator.userAgent));
  const sways = !fine && !ios;
  const card = memberCard(page);
  await expect(card).toHaveClass(sways ? /\bidle\b/ : /^(?!.*\bidle\b)/);
  if (sways) {
    expect(
      await card.evaluate((c) => c.getAnimations().map((a) => (a as CSSAnimation).animationName)),
    ).toEqual(["m-sway"]);
    await tapCard(page, hasTouch);
    await settledOn(page, "back");
    await expect(card).not.toHaveClass(/\bidle\b/);
  }
});

test("[PD-06] member card under reduced motion: the pointer moves nothing, no sway; it still turns over", async ({
  page,
  isMobile,
  hasTouch,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.locator("html")).toHaveClass(/(^|\s)rm(\s|$)/);
  await cardAtRest(page);
  const card = memberCard(page);
  await expect(card).not.toHaveClass(/\bidle\b/);
  if (!isMobile) {
    const box = await card.boundingBox();
    if (!box) throw new Error("no card box");
    await page.mouse.move(box.x + box.width - 2, box.y + 2, { steps: 4 });
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await expect(card).not.toHaveClass(/\blive\b/);
    expect(await card.evaluate((c) => c.style.getPropertyValue("--rx"))).toBe("");
    const a = await cardAngles(page);
    expect(Math.abs(a.rx) + Math.abs(a.ry)).toBeLessThan(0.01);
  }
  await tapCard(page, hasTouch);
  await settledOn(page, "back");
});

test("[PD-06] member card: a ≥ 44 px target; turned over then resized, it stays on its back and fits", async ({
  page,
  hasTouch,
}) => {
  await open(page);
  await cardAtRest(page);
  const card = memberCard(page);
  const b = await card.boundingBox();
  expect(b?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(b?.width ?? 0).toBeGreaterThanOrEqual(44);
  await tapCard(page, hasTouch);
  await settledOn(page, "back");
  const size = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 700 });
  await cardAtRest(page);
  await settledOn(page, "back");
  const fit = await page.evaluate(() => {
    const c = document.querySelector('[data-parity="member-card"]')?.getBoundingClientRect();
    const t = document.querySelector('[data-parity="member-card-tile"]')?.getBoundingClientRect();
    return c && t
      ? {
          c: c.right <= t.right + 0.5 && c.left >= t.left - 0.5,
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      : null;
  });
  expect(fit).toEqual({ c: true, over: 0 });
  if (size) await page.setViewportSize(size);
});

test("[PD-06] /dev/molten PD-06 tiles at 320, 390 and 1440: no horizontal scroll (screens for inspection)", async ({
  page,
  shoot,
}) => {
  // 21 screens and their settling waits: past 60 s on CI's WebKit runner (CI 45061015313).
  test.slow();
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
    for (const tile of [
      "tabs-tile",
      "text-field-tile",
      "stars-tile",
      "slider-tile",
      "member-card-tile",
    ]) {
      await page.locator(`[data-parity="${tile}"]`).scrollIntoViewIfNeeded();
      await shoot(`molten-${tile}-${String(width)}`, { fullPage: false });
    }
  }
  // Rated: the word and the two equal choices, once they have settled.
  await rating(page).getByRole("radio", { name: "4 stars" }).click();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await rateTile(page).scrollIntoViewIfNeeded();
    await expect
      .poll(() => runningWithin(rateTile(page).locator(".m-rate-actions")), { timeout: 5_000 })
      .toBe(0);
    await shoot(`molten-stars-tile-rated-${String(width)}`, { fullPage: false });
  }
  // The member card turned over to the QR placeholder.
  await cardAtRest(page);
  await tapCard(page, false);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await cardAtRest(page);
    await settledOn(page, "back");
    await shoot(`molten-member-card-tile-back-${String(width)}`, { fullPage: false });
  }
});
