// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  NAV,
  PAGE_TRANSITION,
  VT_DOWNGRADE_SCRIPT,
  hasTypedViewTransitions,
  navDirection,
  tabTransitionTypes,
  vtName,
} from "./route-transitions";

describe("[P0-10] navDirection", () => {
  it.each([
    [0, 1, "forward"],
    [0, 3, "forward"],
    [3, 1, "back"],
    [2, 2, "none"],
    [-1, 2, "none"],
    [1, Number.NaN, "none"],
    [1.5, 2, "none"],
  ] as const)("%s → %s is %s", (from, to, expected) => {
    expect(navDirection(from, to)).toBe(expected);
  });
});

describe("[P0-10] tabTransitionTypes", () => {
  it("tags a move to a later tab forward and to an earlier tab back", () => {
    expect(tabTransitionTypes(0, 2)).toEqual([NAV.tabForward]);
    expect(tabTransitionTypes(2, 0)).toEqual([NAV.tabBack]);
  });

  it("adds no type when the tab doesn't change or the order is unknown", () => {
    expect(tabTransitionTypes(1, 1)).toEqual([]);
    expect(tabTransitionTypes(-1, 1)).toEqual([]);
  });
});

describe("[P0-10] PAGE_TRANSITION", () => {
  it("maps every navigation type to its own class and anything untyped to none", () => {
    for (const type of Object.values(NAV)) expect(PAGE_TRANSITION[type]).toBe(type);
    expect(PAGE_TRANSITION.default).toBe("none");
  });
});

describe("[P0-10] vtName", () => {
  const IDENT = /^vt-[a-z][a-z0-9]*-[A-Za-z0-9_]+$/;

  it("is stable and a valid CSS ident for any id", () => {
    for (const id of ["42", "0f3a-9b", "Brew & Bloom", "é😀", "a_b", "--x", "none"]) {
      const name = vtName("shop", id);
      expect(name).toBe(vtName("shop", id));
      // A <custom-ident>: starts with a letter, never `none`/`auto`, only ASCII letters, digits, - and _.
      expect(name).toMatch(IDENT);
    }
  });

  it("never maps two different ids, or the same id of two kinds, to one name", () => {
    const ids = ["a-b", "a_b", "a b", "a_2d_b", "a/b", "A-B", "42", "4_2"];
    const names = ids.map((id) => vtName("shop", id));
    expect(new Set(names).size).toBe(ids.length);
    expect(vtName("shop", "1")).not.toBe(vtName("card", "1"));
  });

  it("accepts numbers and rejects kinds that aren't a plain lower-case word", () => {
    expect(vtName("shop", 7)).toBe(vtName("shop", "7"));
    expect(() => vtName("shop-card", "1")).toThrow();
    expect(() => vtName("", "1")).toThrow();
    expect(() => vtName("shop", "")).toThrow();
  });
});

describe("[P0-10] View Transitions support", () => {
  const win = window as unknown as { ViewTransition?: unknown };
  const originalCtor = win.ViewTransition;
  afterEach(() => {
    // jsdom has no startViewTransition: the tests only ever add an own property, so remove it.
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    win.ViewTransition = originalCtor;
  });

  const withApi = (types: boolean) => {
    (document as { startViewTransition?: unknown }).startViewTransition = () => ({});
    function FakeViewTransition(): void {}
    if (types)
      Object.defineProperty(FakeViewTransition.prototype, "types", { get: () => new Set() });
    win.ViewTransition = FakeViewTransition;
  };

  it("reports typed support only when startViewTransition exists and ViewTransition has types", () => {
    expect(hasTypedViewTransitions(window)).toBe(false); // jsdom: no API
    withApi(false);
    expect(hasTypedViewTransitions(window)).toBe(false);
    withApi(true);
    expect(hasTypedViewTransitions(window)).toBe(true);
  });

  const run = () => {
    // The script is our own constant; this is how the browser runs it from the inline <script>.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    (new Function(VT_DOWNGRADE_SCRIPT) as () => void)();
  };

  it("the pre-paint downgrade hides startViewTransition when types are missing (Safari 18.0–18.1)", () => {
    withApi(false);
    run();
    expect(typeof document.startViewTransition).not.toBe("function");
  });

  it("the pre-paint downgrade leaves full support and no support alone, without throwing", () => {
    withApi(true);
    run();
    expect(typeof document.startViewTransition).toBe("function");
    (document as { startViewTransition?: unknown }).startViewTransition = undefined;
    win.ViewTransition = undefined;
    expect(run).not.toThrow();
  });
});
