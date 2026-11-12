import { describe, expect, it } from "vitest";
import { portalLinks } from "./switcher";

describe("[P0-12] portalLinks (C-02 role switcher)", () => {
  it("a customer only has nothing to switch to", () => {
    expect(portalLinks({ adminRole: null, shopRoles: [] })).toEqual([]);
  });

  it("shop staff switch between the dashboard and the customer app, dashboard first", () => {
    expect(portalLinks({ adminRole: null, shopRoles: [{}] }).map((l) => l.href)).toEqual([
      "/dashboard",
      "/wallet",
    ]);
  });

  it("an admin who is also staff gets all three, admin first", () => {
    expect(portalLinks({ adminRole: "support", shopRoles: [{}, {}] }).map((l) => l.portal)).toEqual(
      ["admin", "shop", "customer"],
    );
  });

  it("an admin without shops gets admin and the customer app", () => {
    expect(portalLinks({ adminRole: "owner", shopRoles: [] }).map((l) => l.label)).toEqual([
      "Admin",
      "Customer app",
    ]);
  });
});
