import { expect, newClientIp, test, testApiHeaders } from "./support/test";

/**
 * P0-12 step F (production build): default portal per role (C-02), signed-in staff on the staff sign-in page
 * (C-05), `Cache-Control` on every kind of portal response, and the admin IP allowlist both ways (C-24).
 */
const NO_STORE = "private, no-store";

test.describe("[P0-12] portal access", () => {
  test("C-02: /portal sends each role to its default portal; signed out to sign-in", async ({
    page,
    signInAs,
    request,
  }) => {
    const out = await request.get("/portal", { maxRedirects: 0 });
    expect(out.status()).toBe(307);
    expect(out.headers().location).toBe("/sign-in");
    for (const [role, to] of [
      ["customer", "/wallet"],
      ["staff", "/dashboard"],
      ["admin_finance", "/admin"],
    ] as const) {
      await page.context().clearCookies();
      await signInAs(role);
      await page.goto("/portal");
      await expect(page, role).toHaveURL(new RegExp(`${to}$`));
    }
  });

  test("C-05: signed-in staff and admins skip the staff sign-in form; a customer sees it", async ({
    page,
    signInAs,
  }) => {
    await signInAs("owner");
    await page.goto("/staff/sign-in");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/staff/sign-in?returnTo=%2Fdashboard%2Fsettings");
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    // A returnTo outside the app is refused: the default portal instead.
    await page.goto("/staff/sign-in?returnTo=https%3A%2F%2Fevil.example%2F");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await signInAs("admin_support");
    await page.goto("/staff/sign-in");
    await expect(page).toHaveURL(/\/admin$/);

    await page.context().clearCookies();
    await signInAs("customer");
    await page.goto("/staff/sign-in");
    await expect(page).toHaveURL(/\/staff\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Staff sign in" })).toBeVisible();
  });

  test("Cache-Control is private, no-store on portal HTML, RSC, 403, not-found and redirects", async ({
    page,
    signInAs,
    request,
  }) => {
    // Redirect (signed out).
    const redirect = await request.get("/wallet", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    expect(redirect.headers()["cache-control"]).toBe(NO_STORE);

    await signInAs("staff");
    const api = page.context().request;
    const html = await api.get("/dashboard");
    expect(html.status()).toBe(200);
    expect(html.headers()["cache-control"]).toBe(NO_STORE);
    const rsc = await api.get("/dashboard/requests?_rsc=e2e", { headers: { rsc: "1" } });
    expect(rsc.status()).toBe(200);
    expect(rsc.headers()["content-type"]).toContain("text/x-component");
    expect(rsc.headers()["cache-control"]).toBe(NO_STORE);
    const forbidden = await api.get("/dashboard/settings");
    expect(forbidden.status()).toBe(403);
    expect(forbidden.headers()["cache-control"]).toBe(NO_STORE);
    const missing = await api.get("/dashboard/no-such-page");
    expect(missing.status()).toBe(404);
    expect(missing.headers()["cache-control"]).toBe(NO_STORE);
  });
});

test.describe("[P0-12] C-24 admin IP allowlist (test-only per-request list)", () => {
  const LIST = "203.0.113.0/24";
  const allowlisted = (ip: string): Record<string, string> => ({
    ...testApiHeaders(),
    "x-test-admin-allowlist": LIST,
    "x-forwarded-for": ip,
  });

  test("admin pages: off-list → the 403 page; on-list → the page", async ({ page, signInAs }) => {
    await signInAs("admin_owner");
    await page.setExtraHTTPHeaders(allowlisted(newClientIp()));
    const off = await page.goto("/admin/system");
    expect(off?.status()).toBe(403);
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expect(page.locator("[data-portal]")).toHaveCount(0);

    await page.setExtraHTTPHeaders(allowlisted("203.0.113.20"));
    const on = await page.goto("/admin/system");
    expect(on?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible();
  });

  test("sign-in: the right password off-list answers like a wrong one; on-list it works", async ({
    createUser,
    playwright,
    baseURL,
  }) => {
    const user = await createUser("c24-admin", { admin: true });
    const origin = baseURL ?? "";
    const api = await playwright.request.newContext({ baseURL: origin });
    const signIn = (password: string, ip: string) =>
      api.post("/api/auth/sign-in/email", {
        headers: { ...allowlisted(ip), origin },
        data: { email: user.email, password },
      });
    const right = await signIn(user.password, newClientIp());
    const wrong = await signIn("wrong-password-123", newClientIp());
    expect(right.status()).toBe(401);
    expect(wrong.status()).toBe(401);
    expect(await right.json()).toEqual(await wrong.json());
    expect(right.headers()["set-cookie"] ?? "").not.toContain("session_token");
    const onList = await signIn(user.password, "203.0.113.21");
    expect(onList.status()).toBe(200);
    await api.dispose();
  });
});
