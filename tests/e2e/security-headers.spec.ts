import { expect, test } from "./support/test";

/**
 * Security baseline in a real browser (SECURITY §5). Header values are unit-tested in
 * src/server/security/headers.test.ts; here we prove the browser enforces them and the app still works.
 */
test.describe("[P0-05] security headers and CSP", () => {
  test("[P0-05] pages carry the security headers, a nonce CSP and a request id, and still hydrate", async ({
    page,
  }) => {
    const res = await page.goto("/sign-in");
    const headers = res?.headers() ?? {};
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
    );
    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers["x-powered-by"]).toBeUndefined();
    // Hydrated: the submit button is enabled only after React takes over (useHydrated).
    await expect(page.getByRole("button", { name: /email me a sign-in link/i })).toBeEnabled();
  });
});

test.describe("[P0-19] prefetch responses carry the static security headers (SEC-10)", () => {
  // The proxy skips prefetch requests (a nonce is useless there), so next.config adds the static set.
  for (const prefetch of [
    { "next-router-prefetch": "1", rsc: "1" },
    { purpose: "prefetch" },
  ] as const) {
    test(`[P0-19] ${Object.keys(prefetch).join(" + ")}`, async ({ request }) => {
      const res = await request.get("/sign-in", { headers: prefetch });
      const h = res.headers();
      expect(h["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains; preload");
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["cross-origin-opener-policy"]).toBe("same-origin");
      expect(h["permissions-policy"]).toContain("camera=()");
      expect(h["x-frame-options"]).toBe("DENY");
    });
  }

  test("[P0-19] normal pages keep the proxy's nonce CSP and frame-ancestors, with the same static set", async ({
    request,
  }) => {
    const h = (await request.get("/sign-in")).headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains; preload");
  });
});
