import { describe, expect, it } from "vitest";
import { ACTIVE_SHOP_MAX_AGE_S, activeShopCookie } from "./active-shop";

describe("[P0-12] active-shop cookie", () => {
  it("https: __Host- name, Secure, httpOnly, Lax, path /, explicit Max-Age", () => {
    expect(activeShopCookie("https://staging.example.co.uk")).toEqual({
      name: "__Host-moz_shop",
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: ACTIVE_SHOP_MAX_AGE_S,
      },
    });
  });
  it("plain http (local, E2E): moz_shop without Secure", () => {
    const c = activeShopCookie("http://localhost:3100");
    expect(c.name).toBe("moz_shop");
    expect(c.options.secure).toBe(false);
    expect(c.options.httpOnly).toBe(true);
  });
  it("Max-Age is set explicitly (30 days), never a library default", () => {
    expect(ACTIVE_SHOP_MAX_AGE_S).toBe(2_592_000);
  });
});
