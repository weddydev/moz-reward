// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { __scrollLockCount, lockScroll } from "./scroll-lock";

const root = (): HTMLElement => document.documentElement;

describe("[P0-09] scroll lock counter", () => {
  afterEach(() => {
    root().removeAttribute("style");
  });

  it("locks the page while at least one overlay holds it", () => {
    const release = lockScroll();
    expect(root().style.overflow).toBe("hidden");
    expect(root().dataset.scrollLocked).toBe("");
    release();
    expect(root().style.overflow).toBe("");
    expect(root().dataset.scrollLocked).toBeUndefined();
    expect(__scrollLockCount()).toBe(0);
  });

  it("two overlays closing in either order leave the page scrollable", () => {
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const releases = [lockScroll(), lockScroll()];
      expect(__scrollLockCount()).toBe(2);
      releases[order[0] ?? 0]?.();
      expect(root().style.overflow).toBe("hidden");
      releases[order[1] ?? 1]?.();
      expect(root().style.overflow).toBe("");
      expect(__scrollLockCount()).toBe(0);
    }
  });

  it("a release called twice counts once", () => {
    const a = lockScroll();
    const b = lockScroll();
    a();
    a();
    expect(root().style.overflow).toBe("hidden");
    b();
    expect(root().style.overflow).toBe("");
  });

  it("restores the page's own inline overflow and padding", () => {
    root().style.overflow = "clip";
    root().style.paddingRight = "3px";
    const release = lockScroll();
    expect(root().style.overflow).toBe("hidden");
    release();
    expect(root().style.overflow).toBe("clip");
    expect(root().style.paddingRight).toBe("3px");
  });

  it("pads for a classic scrollbar so the page does not shift sideways", () => {
    // jsdom: innerWidth 1024, clientWidth 0 → treat as no layout; force a 15px scrollbar.
    Object.defineProperty(root(), "clientWidth", { configurable: true, value: 1009 });
    const release = lockScroll();
    expect(root().style.paddingRight).toBe("15px");
    release();
    expect(root().style.paddingRight).toBe("");
    Reflect.deleteProperty(root(), "clientWidth");
  });
});
