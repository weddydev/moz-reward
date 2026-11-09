import { describe, expect, it } from "vitest";
import { findActiveShopName } from "@/server/repos/shops";
import { makeShop } from "@/server/testing/factories";

describe("[P0-06] sign-in shop context lookup", () => {
  it("names an active shop by its code (trading name first)", async () => {
    const plain = await makeShop({ name: "Brew & Bean Ltd", status: "active" });
    const traded = await makeShop({
      name: "Kettle Ltd",
      tradingName: "The Kettle",
      status: "active",
    });
    expect(await findActiveShopName(plain.shopCode)).toBe("Brew & Bean Ltd");
    expect(await findActiveShopName(traded.shopCode)).toBe("The Kettle");
  });

  it("says nothing about pending, suspended or unknown shops", async () => {
    const pending = await makeShop({ status: "pending" });
    const suspended = await makeShop({ status: "suspended" });
    expect(await findActiveShopName(pending.shopCode)).toBeNull();
    expect(await findActiveShopName(suspended.shopCode)).toBeNull();
    expect(await findActiveShopName("ZZZZZZ")).toBeNull();
  });
});
