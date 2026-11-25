import { describe, expect, it } from "vitest";
import { isPlainClick, lateDelay, sinkOrigin, stageBox, walletCopyAt } from "./wipe-stage";

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

  it("[PD-11] parts that stream in after the wipe opened: a bar fills for what is left of its 420 ms; a rise only for a new index; nothing once the window (1,320 ms) is over", () => {
    const risen = new Set([0, 1, 2]); // the loading cover's header
    expect(lateDelay("bar", 300, risen)).toBe(120);
    expect(lateDelay("bar", 600, risen)).toBe(0);
    expect(lateDelay("bar", 1_319, risen)).toBe(0);
    expect(lateDelay("bar", 1_320, risen)).toBeNull();
    // The page's own header replaces the cover's: it has already risen, so it doesn't rise twice.
    expect(lateDelay({ rise: 1 }, 400, risen)).toBeNull();
    // Content below it rises in its place in the stagger (300 + 60 × k from the tap), or at once if late.
    expect(lateDelay({ rise: 4 }, 400, risen)).toBe(140);
    expect(lateDelay({ rise: 6 }, 1_000, risen)).toBe(0);
    expect(lateDelay({ rise: 6 }, 1_400, risen)).toBeNull();
    expect(lateDelay({ rise: Number.NaN }, 400, risen)).toBeNull();
  });

  it("[PD-11] the shop commits before the metal covers the screen: a copy of the Wallet keeps sinking under it, on the sink's schedule (600 ms, held after), none once the metal (620 ms) is full", () => {
    expect(walletCopyAt(0)).toBe(0);
    expect(walletCopyAt(40)).toBe(40);
    expect(walletCopyAt(599)).toBe(599);
    expect(walletCopyAt(610)).toBe(600);
    expect(walletCopyAt(619)).toBe(600);
    expect(walletCopyAt(620)).toBeNull();
    expect(walletCopyAt(2_000)).toBeNull();
    expect(walletCopyAt(-5)).toBe(0);
    expect(walletCopyAt(Number.NaN)).toBeNull();
  });
});
