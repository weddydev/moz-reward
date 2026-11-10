import { expect, test } from "./support/test";

/**
 * P0-13 (AC1, C-26) on the production build: the browser SDK loads lazily (after hydration, in its own chunk),
 * reports an uncaught error through our tunnel only, and what it sends has no email and no sign-in token.
 */
test.use({ guardAllow: [/^pageerror: sentry-probe/] });

test("[P0-13] a browser error is reported through /api/monitoring, scrubbed, never straight to sentry.io", async ({
  page,
}) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost")) outbound.push(r.url());
  });
  await page.goto("/sign-in?returnTo=%2Fwallet&token=secret-probe-token");
  await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeEnabled();
  // The SDK is loaded at idle; wait for it instead of sleeping.
  await page.waitForFunction(() => "__SENTRY__" in window, undefined, { timeout: 10_000 });

  const tunnel = page.waitForRequest(
    (r) => r.url().endsWith("/api/monitoring") && r.method() === "POST",
  );
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("sentry-probe for jane.doe@example.com");
    }, 0);
  });
  const request = await tunnel;
  const body = request.postData() ?? "";
  expect(body).toContain("sentry-probe for [redacted]");
  expect(body).not.toContain("jane.doe");
  expect(body).not.toContain("secret-probe-token");
  expect((await request.response())?.status()).toBe(204);
  expect(outbound.filter((u) => /sentry/i.test(u))).toEqual([]);
});
