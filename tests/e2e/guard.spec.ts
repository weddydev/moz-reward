import { expect, test } from "./support/test";

/**
 * Self-tests for the console/network guard (P0-17 acceptance: "fails a deliberately erroring page
 * and passes once fixed"). `test.fail()` cases pass only if the guard fails them.
 * One browser is enough to prove the fixture; the guard code is identical on every project.
 */
test.describe("[P0-17] console/network guard", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "chromium", "fixture self-test runs once");
  });

  test("passes on a clean page", async ({ page }) => {
    await page.goto("/dev/guard-check?mode=ok");
    await expect(page.getByTestId("guard-status")).toHaveText("ready");
  });

  for (const mode of ["console-error", "throw", "rejection", "hydration"] as const) {
    test(`fails on ${mode}`, async ({ page }) => {
      test.fail();
      await page.goto(`/dev/guard-check?mode=${mode}`);
      await expect(page.getByTestId("guard-mode")).toHaveText(mode);
      await expect(page.getByTestId("guard-status")).toHaveText("ready");
    });
  }

  test("fails on a 5xx response", async ({ page }) => {
    test.fail();
    await page.route("**/api/test/guard-500", (route) =>
      route.fulfill({ status: 500, body: "boom" }),
    );
    await page.goto("/dev/guard-check?mode=fetch-500");
    await expect(page.getByTestId("guard-status")).toHaveText("fetched 500");
  });

  test.describe("with an explicit allowlist", () => {
    test.use({ guardAllow: [/^http5xx: 500 GET .*\/api\/test\/guard-500$/] });

    test("passes when the 5xx is expected", async ({ page }) => {
      await page.route("**/api/test/guard-500", (route) =>
        route.fulfill({ status: 500, body: "boom" }),
      );
      await page.goto("/dev/guard-check?mode=fetch-500");
      await expect(page.getByTestId("guard-status")).toHaveText("fetched 500");
    });
  });
});

test.describe("[P0-17] role fixtures and helpers", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "chromium", "fixture self-test runs once");
  });

  for (const role of [
    "customer",
    "staff",
    "owner",
    "admin_owner",
    "admin_support",
    "admin_moderator",
    "admin_finance",
  ] as const) {
    test(`signInAs(${role}) creates a real session`, async ({ page, signInAs }) => {
      const who = await signInAs(role);
      const session = (await (await page.request.get("/api/auth/get-session")).json()) as {
        user: { id: string };
        session: { mfaVerified: boolean };
      };
      expect(session.user.id).toBe(who.userId);
      expect(session.session.mfaVerified).toBe(role !== "customer");
    });
  }

  test("freezeTime pins Date.now in the page", async ({ page, freezeTime }) => {
    await freezeTime("2026-03-29T00:59:00Z"); // one minute before the UK clocks go forward
    await page.goto("/dev/guard-check?mode=ok");
    expect(await page.evaluate(() => new Date().toISOString())).toBe("2026-03-29T00:59:00.000Z");
  });

  test("shoot writes a screenshot under the task folder", async ({ page, shoot }) => {
    await page.goto("/dev/guard-check?mode=ok");
    await expect(page.getByTestId("guard-status")).toHaveText("ready");
    const file = await shoot("guard-ok");
    expect(file.replaceAll("\\", "/")).toMatch(
      /\.artifacts\/screens\/P0-17\/guard-ok--chromium\.png$/,
    );
  });

  test("pushes reads the fake push sink", async ({ pushes }) => {
    expect(Array.isArray(await pushes())).toBe(true);
  });
});
