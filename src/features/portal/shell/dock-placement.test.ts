import { describe, expect, it } from "vitest";
import { CUSTOMER_ROUTES, SHOP_ROUTES } from "../routes";
import { dockPlacement, plainClick } from "./dock-placement";

const customerBar = CUSTOMER_ROUTES.filter((r) => r.mobile);
const customerRest = CUSTOMER_ROUTES.filter((r) => !r.mobile);
const shopBar = SHOP_ROUTES.filter((r) => r.mobile);
const shopRest = SHOP_ROUTES.filter((r) => !r.mobile);

const place = (
  activePath: string | null,
  pending: { from: string; column: number } | null = null,
) =>
  dockPlacement({
    bar: customerBar,
    rest: customerRest,
    activePath,
    hasMore: false,
    pathname: activePath ?? "/elsewhere",
    pending,
  });

describe("[PD-07] dock placement (pure)", () => {
  it("[PD-07] the gold sits on the current page's column; Scan is skipped when counting gold items", () => {
    expect(place("/wallet")).toEqual({ current: 0, columns: 5, column: 0, liquid: 0 });
    // Market is column 3 (after Scan) and the third item the gold can sit on.
    expect(place("/market")).toMatchObject({ column: 3, liquid: 2 });
    expect(place("/me")).toMatchObject({ column: 4, liquid: 3 });
  });

  it("[PD-07] on the Scan page, or a page with no item, the gold sits on nothing", () => {
    expect(place("/scan")).toMatchObject({ column: -1, liquid: -1 });
    expect(place("/notifications")).toMatchObject({ column: -1, liquid: -1 });
  });

  it("[PD-07] a tap pours at once; once the URL changes, the real page decides again", () => {
    // Tapped Market on /wallet: the gold heads there before the navigation commits.
    expect(place("/wallet", { from: "/wallet", column: 3 })).toMatchObject({
      column: 3,
      liquid: 2,
    });
    // Tapped Scan: the gold drains at once.
    expect(place("/wallet", { from: "/wallet", column: -1 })).toMatchObject({ liquid: -1 });
    // The navigation landed (or went elsewhere): the stale tap is ignored.
    expect(place("/offers", { from: "/wallet", column: 3 })).toMatchObject({
      column: 1,
      liquid: 1,
    });
  });

  it("[PD-07] shop: More holds the gold while one of its pages is open", () => {
    const more = shopRest[0]?.path ?? "";
    const p = dockPlacement({
      bar: shopBar,
      rest: shopRest,
      activePath: more,
      hasMore: true,
      pathname: more,
      pending: null,
    });
    expect(p.columns).toBe(shopBar.length + 1);
    expect(p.column).toBe(shopBar.length);
    expect(p.liquid).toBe(shopBar.filter((r) => !r.raised).length);
  });

  it("[PD-07] only a plain primary click counts as a tap that navigates this tab", () => {
    const base = {
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      defaultPrevented: false,
    };
    expect(plainClick(base)).toBe(true);
    expect(plainClick({ ...base, metaKey: true })).toBe(false);
    expect(plainClick({ ...base, ctrlKey: true })).toBe(false);
    expect(plainClick({ ...base, button: 1 })).toBe(false);
    expect(plainClick({ ...base, defaultPrevented: true })).toBe(false);
  });
});
