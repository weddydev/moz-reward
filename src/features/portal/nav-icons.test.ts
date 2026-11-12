import { describe, expect, it } from "vitest";
import { NAV_ICONS } from "./nav-icons";
import { PORTAL_ROUTES } from "./routes";

describe("[P0-12] portal nav icons", () => {
  it("every route in the table has an icon component", () => {
    const missing = PORTAL_ROUTES.filter((r) => !(r.icon in NAV_ICONS)).map((r) => r.path);
    expect(missing).toEqual([]);
  });

  it("the map holds no icon the table doesn't use", () => {
    const used = new Set(PORTAL_ROUTES.map((r) => r.icon));
    expect(Object.keys(NAV_ICONS).filter((name) => !used.has(name))).toEqual([]);
  });
});
