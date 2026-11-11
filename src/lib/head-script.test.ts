// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { HEAD_SCRIPT } from "./head-script";

describe("[P0-10] HEAD_SCRIPT", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("runs both parts: no throw, and the stored motion choice still lands on <html>", () => {
    localStorage.setItem("moz:motion", "reduce");
    expect(() => {
      // Our own constant, run the way the browser runs the inline <script>.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      (new Function(HEAD_SCRIPT) as () => void)();
    }).not.toThrow();
    expect(document.documentElement.getAttribute("data-reduce-motion")).toBe("true");
  });
});
