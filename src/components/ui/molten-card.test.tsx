// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cardGlare,
  cardPointer,
  cardTilt,
  holoShift,
  isIOSDevice,
  MEMBER_CARD,
  memberCardMotion,
  qrPlaceholderCells,
} from "@/lib/motion/controls";
import { MemberCard } from "./MemberCard";

// next/font only runs under the Next compiler.
vi.mock("@/styles/fonts-italic", () => ({ frauncesItalic: { variable: "font-italic" } }));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

describe("[PD-06] member card logic", () => {
  it("[PD-06] cardPointer reads the pointer as 0–1 across and down, clamped; an unsized card reads its centre", () => {
    const rect = { left: 100, top: 50, width: 400, height: 250 };
    expect(cardPointer(300, 175, rect)).toEqual({ px: 0.5, py: 0.5 });
    expect(cardPointer(100, 50, rect)).toEqual({ px: 0, py: 0 });
    expect(cardPointer(500, 300, rect)).toEqual({ px: 1, py: 1 });
    // A pointer that left fast (outside the card): clamped to the edge, never past it.
    expect(cardPointer(-900, 9000, rect)).toEqual({ px: 0, py: 1 });
    expect(cardPointer(300, 175, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      px: 0.5,
      py: 0.5,
    });
    expect(cardPointer(Number.NaN, 175, rect)).toEqual({ px: 0.5, py: 0.5 });
  });

  it("[PD-06] cardTilt is 0 at the centre and ±11° x / ±13° y at the edges, never more", () => {
    expect(cardTilt(0.5, 0.5)).toEqual({ rx: 0, ry: 0 });
    expect(cardTilt(1, 0)).toEqual({ rx: 11, ry: 13 });
    expect(cardTilt(0, 1)).toEqual({ rx: -11, ry: -13 });
    expect(cardTilt(0.75, 0.25)).toEqual({ rx: 5.5, ry: 6.5 });
    // Out of range input is clamped (the card never leans past its limit).
    expect(cardTilt(4, -3)).toEqual({ rx: 11, ry: 13 });
    // No −0 (it would write "-0.00deg").
    expect(Object.is(cardTilt(0.5, 0.5).rx, -0)).toBe(false);
    expect(MEMBER_CARD.tiltXDeg / 2).toBe(11);
    expect(MEMBER_CARD.tiltYDeg / 2).toBe(13);
  });

  it("[PD-06] holoShift moves the 2.6× foil like background-position px py at size 260%", () => {
    // background-position p of a 2.6W image in a W box = offset (W − 2.6W)·p = −1.6W·p; as a share of 2.6W:
    const face = 400;
    for (const p of [0, 0.25, 0.5, 1]) {
      const { x } = holoShift(p, p);
      expect(x * MEMBER_CARD.holoSize * face).toBeCloseTo(-1.6 * face * p, 6);
    }
    expect(holoShift(0, 0)).toEqual({ x: 0, y: 0 });
    expect(holoShift(2, -1).x).toBeCloseTo(-1.6 / 2.6, 10);
    expect(holoShift(2, -1).y).toBe(0);
  });

  it("[PD-06] cardGlare puts the light under the pointer, its ray to the farthest corner, mirrored on the back", () => {
    const w = 400;
    const h = 300;
    const half = Math.hypot(200, 150); // 250
    const centre = cardGlare(0.5, 0.5, w, h, false);
    expect(centre.size).toBeCloseTo(2 * half, 10);
    expect(centre.scale).toBeCloseTo(1, 10);
    // Its centre (top-left + half the square) is the pointer.
    expect(centre.x + half).toBeCloseTo(200, 10);
    expect(centre.y + half).toBeCloseTo(150, 10);
    // In a corner the ray reaches the opposite corner: the whole diagonal, twice the half diagonal.
    const corner = cardGlare(0, 0, w, h, false);
    expect(corner.scale).toBeCloseTo(2, 10);
    expect(corner.x + half).toBeCloseTo(0, 10);
    // Off-centre: ray = hypot(max(gx, 1 − gx)·w, max(gy, 1 − gy)·h).
    const off = cardGlare(0.25, 0.9, w, h, false);
    expect(off.scale * half).toBeCloseTo(Math.hypot(0.75 * w, 0.9 * h), 10);
    // Flipped: mirrored across (the reference's `1 - px`).
    expect(cardGlare(0.25, 0.9, w, h, true).x + half).toBeCloseTo(0.75 * w, 10);
    // Clamped, and an unsized face draws nothing.
    expect(cardGlare(-5, 9, w, h, false).y + half).toBeCloseTo(h, 10);
    expect(cardGlare(0.5, 0.5, 0, 0, false)).toEqual({ x: 0, y: 0, size: 0, scale: 1 });
  });

  it("[PD-06] isIOSDevice: iPhone, iPad and iPadOS (a Mac with touch) are iOS; a Mac or Android is not", () => {
    expect(isIOSDevice({ userAgent: IPHONE })).toBe(true);
    expect(isIOSDevice({ userAgent: IPHONE.replace("iPhone;", "iPad;") })).toBe(true);
    expect(isIOSDevice({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: MAC, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIOSDevice({ userAgent: PIXEL, platform: "Linux armv81", maxTouchPoints: 5 })).toBe(
      false,
    );
  });

  it("[PD-06] memberCardMotion: no tilt under reduced motion or on iOS; sway only on touch-only screens", () => {
    expect(memberCardMotion({ reduced: false, ios: false, fine: true })).toEqual({
      follow: true,
      tilt: true,
      sway: false,
    });
    expect(memberCardMotion({ reduced: false, ios: false, fine: false })).toEqual({
      follow: true,
      tilt: true,
      sway: true,
    });
    // iOS: the foil and glare follow the finger; the card never tilts or sways.
    expect(memberCardMotion({ reduced: false, ios: true, fine: false })).toEqual({
      follow: true,
      tilt: false,
      sway: false,
    });
    // Reduced motion: nothing follows, tilts or sways, on any device.
    for (const ios of [false, true])
      for (const fine of [false, true])
        expect(memberCardMotion({ reduced: true, ios, fine })).toEqual({
          follow: false,
          tilt: false,
          sway: false,
        });
  });

  it("[PD-06] qrPlaceholderCells draws the reference's pattern: seed 42, three finder squares", () => {
    const cells = qrPlaceholderCells();
    expect(cells).toHaveLength(25);
    expect(cells.every((r) => r.length === 25)).toBe(true);
    // The reference's generator, cell by cell.
    let seed = 42;
    const rand = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const finder = (x: number, y: number): boolean =>
      [
        [0, 0],
        [18, 0],
        [0, 18],
      ].some(([fx = 0, fy = 0]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < 25; x++) {
        const v = rand() > 0.52;
        if (!finder(x, y)) expect(cells[y]?.[x], `${String(x)},${String(y)}`).toBe(v);
      }
    // Finder: ring, gap, 3×3 core.
    const top = cells[0]?.slice(0, 7);
    expect(top).toEqual([true, true, true, true, true, true, true]);
    expect(cells[1]?.slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(cells[3]?.slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    expect(cells[21]?.slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    expect(cells[6]?.slice(18, 25)).toEqual([true, true, true, true, true, true, true]);
  });

  it("[PD-06] the sway keyframes are the reference's, verbatim", () => {
    // Literal patterns (Semgrep detect-non-literal-regexp): the keyframes body, two levels of braces deep.
    const body = (m: RegExpExecArray | null): string =>
      (m?.[1] ?? "").replace(/\s+/g, "").replace(/;\}/g, "}");
    const ref = body(
      /@keyframes sway\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/.exec(
        readFileSync("design/reference/molten/index.html", "utf8"),
      ),
    );
    expect(ref).not.toBe("");
    expect(
      body(
        /@keyframes m-sway\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/.exec(
          readFileSync("src/styles/molten.css", "utf8"),
        ),
      ),
    ).toBe(ref);
  });
});

/** A jsdom matchMedia answering `fine` for the fine-pointer query and false otherwise. */
function pointer(fine: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: q.includes("pointer: fine") ? fine : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

const card = (): HTMLElement => screen.getByRole("button", { name: /member card/i });

function Demo(): React.JSX.Element {
  return (
    <MemberCard
      name="Aisha Khan"
      memberId="K7Q-42M"
      tier="Gold member"
      since="since Nov 2026"
      backText="Show this at the till · K7Q-42M"
    />
  );
}

describe("[PD-06] MemberCard", () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    // jsdom has no canvas: the placeholder draws nothing (and says nothing) here.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = () => {};
    });
    pointer(true);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 252,
      right: 400,
      bottom: 252,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => {
    document.documentElement.classList.remove("rm");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const flush = (): void => {
    const run = frames;
    frames = [];
    for (const f of run) f(performance.now());
  };

  it("[PD-06] is a focusable button named for its face; a click turns it and the name says so", () => {
    render(<Demo />);
    const el = card();
    expect(el).toHaveAttribute("tabindex", "0");
    expect(el).not.toHaveAttribute("aria-disabled");
    expect(el).toHaveAccessibleName("Member card: Aisha Khan, K7Q-42M. Press to show QR code");
    fireEvent.click(el);
    expect(el).toHaveAccessibleName("Member card showing QR code. Press to turn back");
    expect(el.style.getPropertyValue("--flip")).toBe("180deg");
    expect(el).toHaveAttribute("data-face", "back");
    fireEvent.click(el);
    expect(el.style.getPropertyValue("--flip")).toBe("0deg");
    expect(el).toHaveAttribute("data-face", "front");
  });

  it("[PD-06] Enter and Space turn it without scrolling the page; a held key turns it once; other keys do nothing", () => {
    render(<Demo />);
    const el = card();
    expect(fireEvent.keyDown(el, { key: "Enter" })).toBe(false); // default prevented
    expect(el).toHaveAttribute("data-face", "back");
    expect(fireEvent.keyDown(el, { key: " " })).toBe(false);
    expect(el).toHaveAttribute("data-face", "front");
    fireEvent.keyDown(el, { key: " ", repeat: true });
    expect(el).toHaveAttribute("data-face", "front");
    fireEvent.keyDown(el, { key: "a" });
    fireEvent.keyDown(el, { key: "Tab" });
    expect(el).toHaveAttribute("data-face", "front");
  });

  it("[PD-06] rapid flips end on the face the count says (an even number of taps: front)", () => {
    const onFlip = vi.fn();
    render(<MemberCard name="A" memberId="B" tier="T" since="S" backText="X" onFlip={onFlip} />);
    for (let i = 0; i < 7; i++) fireEvent.click(card());
    expect(card()).toHaveAttribute("data-face", "back");
    fireEvent.click(card());
    expect(card()).toHaveAttribute("data-face", "front");
    expect(onFlip).toHaveBeenCalledTimes(8);
    expect(onFlip).toHaveBeenLastCalledWith(false);
  });

  it("[PD-06] the pointer tilts it once per frame (the last move wins) and lights the glare; leaving springs back", () => {
    render(<Demo />);
    const el = card();
    fireEvent.pointerMove(el, { clientX: 300, clientY: 63 });
    fireEvent.pointerMove(el, { clientX: 400, clientY: 0 });
    expect(el).toHaveClass("live");
    // Nothing written until the frame: one write per frame, whatever the event rate.
    expect(el.style.getPropertyValue("--rx")).toBe("");
    expect(frames).toHaveLength(1);
    flush();
    expect(el.style.getPropertyValue("--rx")).toBe("11.00deg");
    expect(el.style.getPropertyValue("--ry")).toBe("13.00deg");
    expect(el.style.getPropertyValue("--holo-x")).toBe("-61.538%");
    fireEvent.pointerLeave(el);
    expect(el).not.toHaveClass("live");
    expect(el.style.getPropertyValue("--rx")).toBe("0deg");
    expect(el.style.getPropertyValue("--ry")).toBe("0deg");
  });

  it("[PD-06] a pointer leaving before the frame never tilts the card afterwards", () => {
    render(<Demo />);
    const el = card();
    fireEvent.pointerMove(el, { clientX: 400, clientY: 0 });
    fireEvent.pointerLeave(el);
    flush();
    expect(el.style.getPropertyValue("--rx")).toBe("0deg");
    expect(el).not.toHaveClass("live");
  });

  it("[PD-06] reduced motion: the pointer moves nothing; the card still flips", () => {
    document.documentElement.classList.add("rm");
    render(<Demo />);
    const el = card();
    fireEvent.pointerMove(el, { clientX: 400, clientY: 0 });
    flush();
    expect(el).not.toHaveClass("live");
    expect(el.style.getPropertyValue("--rx")).toBe("");
    expect(el.style.getPropertyValue("--holo-x")).toBe("");
    fireEvent.click(el);
    expect(el).toHaveAttribute("data-face", "back");
  });

  it("[PD-06] iOS: no tilt, no sway; the foil still follows the finger", () => {
    pointer(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    render(<Demo />);
    const el = card();
    expect(el).not.toHaveClass("idle");
    fireEvent.pointerMove(el, { clientX: 400, clientY: 0 });
    flush();
    expect(el.style.getPropertyValue("--rx")).toBe("");
    expect(el.style.getPropertyValue("--holo-x")).toBe("-61.538%");
    fireEvent.pointerLeave(el);
    expect(el).not.toHaveClass("idle");
  });

  it("[PD-06] touch-only screens: it sways while untouched, never while flipped, and stops when touched", () => {
    pointer(false);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(PIXEL);
    render(<Demo />);
    const el = card();
    expect(el).toHaveClass("idle");
    fireEvent.pointerMove(el, { clientX: 100, clientY: 100 });
    expect(el).not.toHaveClass("idle");
    fireEvent.pointerLeave(el);
    expect(el).toHaveClass("idle");
    fireEvent.click(el);
    expect(el).not.toHaveClass("idle");
    fireEvent.pointerLeave(el);
    expect(el).not.toHaveClass("idle");
  });

  it("[PD-06] a fine pointer never sways", () => {
    render(<Demo />);
    expect(card()).not.toHaveClass("idle");
  });

  it("[PD-06] server render: disabled until hydrated, front face, no sway, the QR placeholder labelled", () => {
    const html = renderToString(<Demo />);
    expect(html).toMatch(
      /role="button"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*role="button"/,
    );
    expect(html).not.toMatch(/class="[^"]*\bidle\b/);
    expect(html).toContain('data-face="front"');
    expect(html).toContain('aria-label="QR code placeholder"');
  });

  it("[PD-06] a back slot replaces the placeholder (P1-14 puts the real code there)", () => {
    render(
      <MemberCard
        name="A"
        memberId="B"
        tier="T"
        since="S"
        backText="X"
        back={<span data-testid="real-qr" />}
      />,
    );
    expect(screen.getByTestId("real-qr")).toBeInTheDocument();
    expect(document.querySelector('[aria-label="QR code placeholder"]')).toBeNull();
  });

  it("[PD-06] unmounting with a frame pending cancels it", () => {
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const { unmount } = render(<Demo />);
    fireEvent.pointerMove(card(), { clientX: 10, clientY: 10 });
    unmount();
    act(() => {
      flush();
    });
    expect(cancel).toHaveBeenCalled();
  });
});
