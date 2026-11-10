import { expect, test } from "./support/test";

/**
 * C-06 (P0-13): on a slow connection the sign-in button stays disabled until the page is interactive (no press is
 * lost), and the screen says why. Simulated by holding every JS chunk (not the CSS, which Next also serves from
 * /_next/static/chunks and which a browser waits for before painting) until the test releases them.
 */
for (const { path, button } of [
  { path: "/sign-in", button: /email me a sign-in link/i },
  { path: "/staff/sign-in", button: /^continue$/i },
]) {
  test(`[P0-13] C-06: ${path} explains the disabled button before hydration`, async ({
    page,
    shoot,
  }) => {
    let release!: () => void;
    const released = new Promise<void>((r) => {
      release = r;
    });
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      await released;
      await route.continue();
    });
    await page.goto(path, { waitUntil: "commit" });
    const hint = page.getByText("Getting the page ready. The button switches on in a moment.");
    await expect(hint).toBeVisible();
    await expect(page.getByRole("button", { name: button })).toBeDisabled();
    await expect(page.getByRole("button", { name: button })).toHaveAccessibleDescription(
      "Getting the page ready. The button switches on in a moment.",
    );
    // WebKit's screenshot waits for the held scripts to finish loading; the assertions above run on both.
    if (test.info().project.name === "chromium") {
      await shoot(`preparing-${path.replaceAll("/", "-").slice(1)}`);
    }
    release();
    await expect(page.getByRole("button", { name: button })).toBeEnabled();
    await expect(hint).toHaveCount(0);
  });
}
