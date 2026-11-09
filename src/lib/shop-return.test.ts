import { describe, expect, it } from "vitest";
import { shopCodeFromReturnTo } from "./shop-return";

describe("[P0-06] sign-in shop context: shop code from the return path", () => {
  it("reads the code from a shop landing path, with or without a query", () => {
    expect(shopCodeFromReturnTo("/s/K7M2QX")).toBe("K7M2QX");
    expect(shopCodeFromReturnTo("/s/K7M2QX?src=qr")).toBe("K7M2QX");
    expect(shopCodeFromReturnTo("/s/k7m2qx")).toBe("K7M2QX");
  });

  it("ignores anything that is not exactly a shop landing path with a valid code", () => {
    for (const path of [
      null,
      "",
      "/wallet",
      "/s/",
      "/s/K7M2Q", // too short
      "/s/K7M2QXX",
      "/s/K7M2Q0", // 0 is not in the code alphabet
      "/s/K7M2QX/extra",
      "/shops/K7M2QX",
      "/S/K7M2QX", // routes are case-sensitive
      "//evil.com/s/K7M2QX",
      "https://evil.com/s/K7M2QX",
    ]) {
      expect(shopCodeFromReturnTo(path), String(path)).toBeNull();
    }
  });
});
