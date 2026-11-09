import { expect, test, testApiHeaders } from "./support/test";

/**
 * Production parity (P0-14): `pnpm e2e` must exercise a production build, and Better Auth's built-in
 * limiter (in-memory, production-only, 5 sign-in links/min per IP) must stay off there — our Redis limits
 * are the only ones (SECURITY §6). The value is read from the running server because, locally, Better Auth
 * has no client IP (TRUSTED_PROXY=none), which silently no-ops its limiter: a request burst proves nothing.
 */
test.describe("[P0-14] production parity", () => {
  test("the E2E server is a production build with Better Auth's built-in limiter off", async ({
    request,
  }) => {
    test.skip(
      process.env.E2E_MODE === "dev" || Boolean(process.env.E2E_BASE_URL),
      "only meaningful against the local production build (`pnpm e2e`)",
    );
    const res = await request.get("/api/test/runtime", { headers: testApiHeaders() });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ nodeEnv: "production", betterAuthRateLimitEnabled: false });
  });
});
