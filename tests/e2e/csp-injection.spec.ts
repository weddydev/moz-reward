import { expect, test } from "./support/test";

/**
 * XSS simulation (SECURITY §5): markup injected into a served page cannot run script without the nonce.
 *
 * Chromium treats a route.fulfill()ed document as non-local, and its Local Network Access checks then block
 * the dev server's HMR websocket to localhost, so the page never hydrates under `next dev`. That is an
 * artefact of the interception, not of the CSP under test, so the check is switched off for this file only
 * (Chromium-only flag; WebKit ignores it). The CSP itself is enforced as normal.
 */
test.use({
  guardAllow: [/^console: .*(Content Security Policy|script-src)/],
  launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] },
});

test("[P0-05] an inline script without the nonce is blocked (XSS simulation), the page keeps working", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|script-src/.test(m.text())) violations.push(m.text());
  });
  await page.route("**/sign-in", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "</body>",
      "<script>window.__injected = 'ran'</script></body>",
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeEnabled();
  expect(await page.evaluate(() => (window as { __injected?: string }).__injected)).toBeUndefined();
  expect(violations.length).toBeGreaterThan(0);
});
