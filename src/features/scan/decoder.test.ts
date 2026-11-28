import { describe, expect, it } from "vitest";
import { FRAME_MAX, frameSize } from "./decoder";

describe("[P2-02] decoder frames", () => {
  it("[P2-02] frames shrink to the long-side cap and are never upscaled", () => {
    expect(frameSize(1280, 720)).toEqual({ w: FRAME_MAX, h: 360 });
    expect(frameSize(720, 1280)).toEqual({ w: 360, h: FRAME_MAX });
    expect(frameSize(320, 240)).toEqual({ w: 320, h: 240 });
    expect(frameSize(0, 0)).toEqual({ w: 1, h: 1 });
  });
});
