// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NAV_INTENT_TTL_MS, setNavIntent, takeNavIntent } from "./nav-intent";
import {
  NAV,
  VT_DOWNGRADE_SCRIPT,
  cssTimeMs,
  enterKeyframes,
  hasTypedViewTransitions,
  viewTransitionActive,
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

describe("[P0-10] page content is never captured (globals.css)", () => {
  const css = readFileSync(path.join(__dirname, "../../app/globals.css"), "utf8");

  it("keeps the root out of every view transition, so the page stays tappable mid-transition", () => {
    expect(css).toMatch(/:root\s*\{\s*view-transition-name:\s*none;\s*\}/);
    expect(css).not.toMatch(/::view-transition-(old|new)\((root|\.nav-)/);
    expect(css).not.toMatch(/view-transition-name:\s*(?!none)[a-z]/);
  });
});

describe("[P0-10] enterKeyframes", () => {
  const offset = (frames: Keyframe[]): string | undefined => frames[0]?.transform as string;

  it("slides the arriving content in from the side the navigation came from", () => {
    expect(offset(enterKeyframes(NAV.forward, true))).toBe("translateX(8px)");
    expect(offset(enterKeyframes(NAV.back, true))).toBe("translateX(-8px)");
    expect(offset(enterKeyframes(NAV.tabForward, true))).toBe("translateX(6px)");
    expect(offset(enterKeyframes(NAV.tabBack, true))).toBe("translateX(-6px)");
  });

  it("fades in from 0 to 1 and ends at rest", () => {
    const frames = enterKeyframes(NAV.forward, true);
    expect(frames.map((f) => f.opacity)).toEqual([0, 1]);
    expect(frames.at(-1)?.transform).toBe("none");
  });

  it("only fades (never the wrong way) without a direction or under reduced motion", () => {
    expect(enterKeyframes(null, true)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(enterKeyframes(NAV.forward, false)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it("animates transform and opacity only", () => {
    for (const type of [...Object.values(NAV), null]) {
      for (const motion of [true, false]) {
        for (const frame of enterKeyframes(type, motion)) {
          expect(Object.keys(frame).filter((k) => k !== "opacity" && k !== "transform")).toEqual(
            [],
          );
        }
      }
    }
  });
});

describe("[P0-10] navigation intent", () => {
  const BASE = "https://moz.test/dev/motion";
  afterEach(() => {
    takeNavIntent("/__clear__", 0);
  });

  it("hands the direction to the page the link pointed at, once", () => {
    setNavIntent("/dev/motion/shop/a?x=1#top", NAV.forward, 1000, BASE);
    expect(takeNavIntent("/dev/motion/shop/a", 1100)).toBe(NAV.forward);
    expect(takeNavIntent("/dev/motion/shop/a", 1200)).toBeNull();
  });

  it("resolves relative links against the current page", () => {
    setNavIntent("tabs/me", NAV.tabForward, 1000, "https://moz.test/dev/motion/");
    expect(takeNavIntent("/dev/motion/tabs/me", 1000)).toBe(NAV.tabForward);
  });

  it("gives nothing to a different page (rapid double navigation, browser back)", () => {
    setNavIntent("/dev/motion/shop/a", NAV.forward, 1000, BASE);
    expect(takeNavIntent("/dev/motion/shop/b", 1100)).toBeNull();
    // A mismatch clears it, so a later visit to the link's page is not tagged either.
    expect(takeNavIntent("/dev/motion/shop/a", 1200)).toBeNull();
  });

  it("expires, so a click that never navigated can't tag a later visit", () => {
    setNavIntent("/dev/motion/shop/a", NAV.forward, 1000, BASE);
    expect(takeNavIntent("/dev/motion/shop/a", 1000 + NAV_INTENT_TTL_MS + 1)).toBeNull();
  });

  it("the second click wins", () => {
    setNavIntent("/dev/motion/shop/a", NAV.forward, 1000, BASE);
    setNavIntent("/dev/motion", NAV.back, 1050, BASE);
    expect(takeNavIntent("/dev/motion", 1100)).toBe(NAV.back);
  });

  it("ignores links it can't parse or that leave the site", () => {
    setNavIntent("https://other.test/dev/motion", NAV.forward, 1000, BASE);
    expect(takeNavIntent("/dev/motion", 1000)).toBeNull();
    setNavIntent("http://[bad", NAV.forward, 1000, BASE);
    expect(takeNavIntent("/dev/motion", 1000)).toBeNull();
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

describe("[P0-10] cssTimeMs", () => {
  it.each([
    ["380ms", 380],
    [".38s", 380], // the production CSS minifier rewrites 380ms as .38s
    ["0.15s", 150],
    [" 150ms ", 150],
    ["0s", 0],
    ["", 0],
    ["var(--x)", 0],
    ["-1s", 0],
    ["12", 0],
  ] as const)("%j → %d", (value, ms) => {
    expect(cssTimeMs(value)).toBe(ms);
  });
});

describe("[P0-10] viewTransitionActive", () => {
  const doc = (matches: (sel: string) => boolean): Document =>
    ({ documentElement: { matches } }) as unknown as Document;

  it("is true while a view transition runs (a card → page morph)", () => {
    expect(viewTransitionActive(doc((sel) => sel === ":active-view-transition"))).toBe(true);
    expect(viewTransitionActive(doc(() => false))).toBe(false);
  });

  it("is false where the pseudo-class is unknown (the selector throws)", () => {
    expect(
      viewTransitionActive(
        doc(() => {
          throw new SyntaxError("unknown pseudo-class");
        }),
      ),
    ).toBe(false);
    expect(viewTransitionActive(document)).toBe(false); // jsdom
  });
});
