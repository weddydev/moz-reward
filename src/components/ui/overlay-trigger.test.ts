// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { currentTrigger } from "./overlay-trigger";

describe("[P0-09] overlay trigger tracking", () => {
  it("remembers a click made before any overlay has mounted (Safari does not focus a clicked button)", () => {
    const button = document.createElement("button");
    button.textContent = "Open";
    document.body.append(button);
    // Only the module has loaded: no Overlay rendered, nothing focused.
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.activeElement).toBe(document.body);
    expect(currentTrigger()).toBe(button);
    button.remove();
    expect(currentTrigger(), "a control that has gone is not a trigger").toBeNull();
  });

  it("falls back to the focused control when nothing was clicked", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    expect(currentTrigger()).toBe(input);
    input.remove();
  });
});
