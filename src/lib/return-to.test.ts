import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("[P0-06] safeReturnTo", () => {
  it.each([
    ["/wallet", "/wallet"],
    ["/s/K7Q42M?src=qr", "/s/K7Q42M?src=qr"],
    ["/shops/abc#vault", "/shops/abc#vault"],
    ["/shops/./abc/../xyz", "/shops/xyz"],
  ])("keeps internal path %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["\\\\evil.example"],
    ["javascript:alert(1)"],
    ["wallet"],
    // Audit security #3: dot-segments normalise to a protocol-relative URL that router.push follows off-site.
    ["/.//evil.example/x"],
    ["/a/..//evil.example"],
    ["/%2e//evil.example"],
    ["/./%2F/evil.example"],
    ["/\tevil"],
  ])("falls back for unsafe value %s", (input) => {
    expect(safeReturnTo(input)).toBe("/wallet");
  });

  it("uses the supplied fallback", () => {
    expect(safeReturnTo("//x", "/dashboard")).toBe("/dashboard");
  });
});

describe("[P0-12] safeReturnTo: pages only (SECURITY §4 allowlist)", () => {
  it.each([
    ["/api/auth/sign-out"],
    ["/api"],
    ["/api?x=1"],
    ["/API/auth/sign-out"],
    ["/_next/static/chunks/a.js"],
    ["/_next"],
    ["/dev/ui"],
    ["/dev"],
    // Dot-segments that normalise into a refused prefix.
    ["/wallet/../api/auth/sign-out"],
    ["/./dev/ui"],
  ])("refuses the non-page target %s", (input) => {
    expect(safeReturnTo(input)).toBe("/wallet");
    expect(safeReturnTo(input, "/dashboard")).toBe("/dashboard");
  });

  it.each([["/apiary"], ["/developers"], ["/devices"], ["/_nextgen"], ["/dashboard/api"]])(
    "keeps a page whose name only starts like one: %s",
    (input) => {
      expect(safeReturnTo(input)).toBe(input);
    },
  );
});
