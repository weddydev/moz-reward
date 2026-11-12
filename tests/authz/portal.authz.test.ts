import { beforeEach, expect, it, vi } from "vitest";
import { runAsPrincipal } from "@/server/authz/principal";
import { authzMatrix, type Role, world } from "./harness";

// The action sets the active-shop cookie; outside a request `cookies()` has no store, so record the writes.
const cookieWrites: { name: string; value: string; options: Record<string, unknown> }[] = [];
vi.mock("next/headers", () => ({
  headers: () => Promise.reject(new Error("outside a request")),
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        cookieWrites.push({ name, value, options });
      },
    }),
}));

const { switchShop } = await import("@/features/portal/actions");

beforeEach(() => {
  cookieWrites.length = 0;
});

// Any active role in the target shop (shop A), TOTP-verified. Admins have no membership: denied.
const SHOP_A_MEMBERS: Role[] = ["staff_own_shop", "owner_own_shop"];

authzMatrix("switchShop", {
  allow: SHOP_A_MEMBERS,
  run: (w) => switchShop({ shopId: w.shopA.id }),
});

it("[P0-12] switchShop sets the active-shop cookie to the authorised shop with the fixed flags", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.staff_own_shop, () =>
    switchShop({ shopId: w.shopA.id.toUpperCase() }),
  );
  expect(res).toEqual({ ok: true, data: { to: "/dashboard" } });
  expect(cookieWrites).toHaveLength(1);
  const [write] = cookieWrites;
  // Lower-case id from the scope, never the raw input.
  expect(write?.value).toBe(w.shopA.id);
  expect(write?.options).toEqual({
    httpOnly: true,
    secure: write?.name === "__Host-moz_shop",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
});

it("[P0-12] switchShop to a shop the caller doesn't belong to writes no cookie", async () => {
  const w = await world();
  const res = await runAsPrincipal(w.principals.staff_own_shop, () =>
    switchShop({ shopId: w.shopB.id }),
  );
  expect(res).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  expect(cookieWrites).toHaveLength(0);
});

it("[P0-12] switchShop refuses anything but a UUID and extra fields", async () => {
  const w = await world();
  for (const input of [{ shopId: "../admin" }, { shopId: w.shopA.id, role: "owner" }]) {
    const res = await runAsPrincipal(w.principals.owner_own_shop, () =>
      switchShop(input as { shopId: string }),
    );
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  }
  expect(cookieWrites).toHaveLength(0);
});
