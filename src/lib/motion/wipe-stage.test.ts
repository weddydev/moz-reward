import { describe, expect, it } from "vitest";
import { isPlainClick, sinkOrigin, stageBox } from "./wipe-stage";

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("[PD-08] gold wipe stage (app)", () => {
  it("[PD-08] only a plain left click plays it (a modified click opens a new tab)", () => {
    expect(isPlainClick(click)).toBe(true);
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"] as const)
      expect(isPlainClick({ ...click, [k]: true })).toBe(false);
    expect(isPlainClick({ ...click, button: 1 })).toBe(false);
  });

  it("[PD-08] the stage covers the content area: below the header while it shows, right of the rail", () => {
    expect(stageBox({ top: 64.4, left: 88 })).toEqual({ top: 64, left: 88 });
    // Scrolled past the header: from the top of the screen.
    expect(stageBox({ top: -420, left: 0 })).toEqual({ top: 0, left: 0 });
  });

  it("[PD-08] the Wallet sinks about the viewport's upper third, wherever its content box starts", () => {
    expect(sinkOrigin({ left: 0, top: 0 }, { width: 390, height: 844 })).toBe("195px 253px");
    // A content box below the header and right of the rail, scrolled 300 px.
    expect(sinkOrigin({ left: 88, top: -300 }, { width: 1440, height: 900 })).toBe("632px 570px");
  });
});
