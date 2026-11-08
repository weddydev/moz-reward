import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./return-to";

describe("[P0-06] safeReturnTo", () => {
  it.each([
    ["/wallet", "/wallet"],
    ["/s/K7Q42M?src=qr", "/s/K7Q42M?src=qr"],
    ["/shops/abc#vault", "/shops/abc#vault"],
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
  ])("falls back for unsafe value %s", (input) => {
    expect(safeReturnTo(input)).toBe("/wallet");
  });

  it("uses the supplied fallback", () => {
    expect(safeReturnTo("//x", "/dashboard")).toBe("/dashboard");
  });
});
