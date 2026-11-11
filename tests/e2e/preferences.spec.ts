import { expect, test } from "./support/test";

/**
 * P0-08 display preferences: the stored motion choice is on <html> before first paint (inline script with the
 * CSP nonce: the guard fixture fails the test on any CSP violation or hydration warning), the toggles persist
 * on the device, and a signed-in customer's choice follows them to another browser.
 */
const html = "html";
const ATTR = "data-reduce-motion";

test("[P0-08] AC7: the stored choice is on <html> before any script chunk has run", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("moz:motion", "reduce");
  });
  let release!: () => void;
  const released = new Promise<void>((r) => {
    release = r;
  });
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
    await released;
    await route.continue();
  });
  // /sign-in renders outside any Suspense boundary, so its HTML is on screen while every script chunk is held.
  await page.goto("/sign-in", { waitUntil: "commit" });
  await expect(
    page.getByText("Getting the page ready. The button switches on in a moment."),
  ).toBeVisible();

  // Hydration has not happened (its chunks are held), yet the attribute is already there.
  expect(await page.evaluate(() => document.documentElement.dataset.hydrated)).toBeUndefined();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");

  release();
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
});

test("[P0-08] AC8: the toggles apply at once and persist across a reload", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true");
  await expect(page.locator(html)).not.toHaveAttribute(ATTR);

  const toggles = page.getByTestId("preference-toggles");
  await toggles.getByRole("radio", { name: "Reduced" }).click();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
  await toggles.getByRole("switch", { name: "Sounds" }).click();
  await expect(toggles.getByRole("switch", { name: "Sounds" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.reload();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "true");
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true");
  await expect(toggles.getByRole("radio", { name: "Reduced" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(toggles.getByRole("switch", { name: "Sounds" })).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // "Full" beats a system that asks for reduced motion; "Device" removes the attribute again.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggles.getByRole("radio", { name: "Full" }).click();
  await expect(page.locator(html)).toHaveAttribute(ATTR, "false");
  await expect(page.getByTestId("motion-result")).toHaveText("Animations are on.");
  await toggles.getByRole("radio", { name: "Device" }).click();
  await expect(page.locator(html)).not.toHaveAttribute(ATTR);
  await expect(page.getByTestId("motion-result")).toHaveText("Animations are reduced.");
});

test("[P0-08] AC8: a signed-in customer's choice is saved to the profile and applies in a fresh browser", async ({
  page,
  browser,
  signInAs,
  baseURL,
}) => {
  await signInAs("customer");
  await page.goto("/dev/ui");
  await expect(page.locator(html)).toHaveAttribute("data-hydrated", "true");
  const toggles = page.getByTestId("preference-toggles");
  await toggles.getByRole("radio", { name: "Reduced" }).click();
  await toggles.getByRole("switch", { name: "Sounds" }).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("moz:prefs-sync")))
    .toBe("synced");

  // Same account, another browser: the session only, no local storage.
  const other = await browser.newContext({
    ...(baseURL ? { baseURL } : {}),
    storageState: { cookies: await page.context().cookies(), origins: [] },
  });
  try {
    const fresh = await other.newPage();
    await fresh.goto("/dev/ui");
    await expect(fresh.locator(html)).toHaveAttribute(ATTR, "true");
    const freshToggles = fresh.getByTestId("preference-toggles");
    await expect(freshToggles.getByRole("switch", { name: "Sounds" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    // From now on this device paints it before hydration too.
    expect(await fresh.evaluate(() => window.localStorage.getItem("moz:motion"))).toBe("reduce");
  } finally {
    await other.close();
  }
});
