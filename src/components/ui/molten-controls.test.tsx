// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoltenHeart } from "@/components/icons/molten-heart";
import { BUTTON, HEART } from "@/lib/motion/controls";
import type * as PressModule from "@/lib/motion/press";
import { Button, onSettled } from "./Button";
import { buttonClasses } from "./button-classes";
import { IconButton } from "./IconButton";
import { Tile } from "./Tile";

const press = vi.hoisted(() => ({ celebrate: vi.fn(), ripple: vi.fn() }));
vi.mock("@/lib/motion/press", async (orig) => ({
  ...(await orig<typeof PressModule>()),
  celebrate: press.celebrate,
  ripple: press.ripple,
}));

beforeEach(() => {
  press.celebrate.mockClear();
  press.ripple.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove("rm");
});

describe("[PD-04] Molten button", () => {
  it("[PD-04] variants and sizes map to the Molten classes (54 by default, 46 small)", () => {
    expect(buttonClasses()).toContain("m-btn-molten");
    expect(buttonClasses()).not.toContain("m-sm");
    expect(buttonClasses({ variant: "orbit", size: 46 })).toMatch(/m-btn-orbit.*m-sm/);
    expect(buttonClasses({ variant: "ghost" })).toContain("m-btn-ghost");
    expect(buttonClasses({ variant: "destructive", block: true })).toMatch(
      /m-btn-destructive.*w-full/,
    );
  });

  it("[PD-04] onSettled: a plain value decides at once; a promise when it settles; false or a rejection is no success", async () => {
    const seen: boolean[] = [];
    onSettled(undefined, (ok) => seen.push(ok));
    onSettled(false, (ok) => seen.push(ok));
    expect(seen).toEqual([true, false]); // synchronous: the roll starts in the click's own task
    await new Promise<void>((resolve) => {
      onSettled(Promise.resolve(1), (ok) => {
        seen.push(ok);
        resolve();
      });
    });
    await new Promise<void>((resolve) => {
      onSettled(Promise.reject(new Error("x")), (ok) => {
        seen.push(ok);
        resolve();
      });
    });
    expect(seen).toEqual([true, false, true, false]);
  });

  it("[PD-04] a successful click rolls the label to the result, moves the accessible name with it, and rolls back after 1.7 s", () => {
    vi.useFakeTimers();
    render(<Button resultLabel="+80 gold added">Collect gold</Button>);
    const btn = screen.getByRole("button", { name: "Collect gold" });
    fireEvent.click(btn);
    expect(btn).toHaveClass("ok");
    expect(screen.getByRole("button", { name: "+80 gold added" })).toBe(btn);
    act(() => {
      vi.advanceTimersByTime(BUTTON.labelBackMs);
    });
    expect(btn).not.toHaveClass("ok");
    expect(screen.getByRole("button", { name: "Collect gold" })).toBe(btn);
  });

  it("[PD-11] idle loops sleep off screen: molten and orbit buttons pause, ghost ones aren't watched (FOLLOWUPS 73)", () => {
    const seen: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
          seen.push(cb);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    render(
      <>
        <Button>Collect</Button>
        <Button variant="orbit">Details</Button>
        <Button variant="ghost">Skip</Button>
      </>,
    );
    expect(seen).toHaveLength(2);
    act(() => {
      for (const cb of seen) cb([{ isIntersecting: false }]);
    });
    expect(screen.getByRole("button", { name: "Collect" })).toHaveAttribute("data-paused");
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("data-paused");
    act(() => {
      seen[0]?.([{ isIntersecting: true }]);
    });
    expect(screen.getByRole("button", { name: "Collect" })).not.toHaveAttribute("data-paused");
    vi.unstubAllGlobals();
  });

  it("[PD-11] a className change while the result shows keeps the roll (FOLLOWUPS 81)", () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Button resultLabel="Saved" className="w-40">
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(btn);
    expect(btn).toHaveClass("ok");
    rerender(
      <Button resultLabel="Saved" className="w-48">
        Save
      </Button>,
    );
    expect(btn).toHaveClass("ok", "w-48");
    act(() => {
      vi.advanceTimersByTime(BUTTON.labelBackMs);
    });
    expect(btn).not.toHaveClass("ok");
  });

  it("[PD-04] double click: one celebration, the roll restarts cleanly from the second click", () => {
    vi.useFakeTimers();
    render(
      <Button resultLabel="Done" celebrate>
        Collect
      </Button>,
    );
    const btn = screen.getByRole("button");
    fireEvent.click(btn, { clientX: 20, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(btn, { clientX: 20, clientY: 10 });
    expect(press.celebrate).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(btn).toHaveClass("ok"); // 2 s after the first click, but only 1 s after the second
    act(() => {
      vi.advanceTimersByTime(BUTTON.labelBackMs);
    });
    expect(btn).not.toHaveClass("ok");
  });

  it("[P1-11] design review M1 (P1-C close): onRollEnd fires when the result's time is up, while the label still shows it", () => {
    vi.useFakeTimers();
    const ends: boolean[] = [];
    const ref: { btn: HTMLElement | null } = { btn: null };
    render(
      <Button
        resultLabel="Request sent"
        onRollEnd={() => {
          ends.push(ref.btn?.classList.contains("ok") ?? false);
        }}
      >
        Request points
      </Button>,
    );
    ref.btn = screen.getByRole("button");
    fireEvent.click(ref.btn);
    act(() => {
      vi.advanceTimersByTime(BUTTON.labelBackMs - 1);
    });
    expect(ends).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Once, and before the roll back: the caller swaps on the same clock as the label.
    expect(ends).toEqual([true]);
    expect(ref.btn).not.toHaveClass("ok");
  });

  it("[demo-fixes] every button throws sparks and coins on a successful click by default (human, 27 Nov); celebrate={false} opts out", () => {
    render(
      <>
        <Button>Molten</Button>
        <Button variant="orbit">Orbit</Button>
        <Button variant="ghost">Ghost</Button>
        <Button celebrate={false}>Quiet</Button>
        <Button variant="destructive">Delete</Button>
      </>,
    );
    for (const name of ["Molten", "Orbit", "Ghost"]) {
      press.celebrate.mockClear();
      fireEvent.click(screen.getByRole("button", { name }), { clientX: 5, clientY: 5 });
      expect(press.celebrate, name).toHaveBeenCalledTimes(1);
      // The default coin count (the press kit's 6), never 0.
      expect(press.celebrate.mock.calls[0]?.[2], name).toBeUndefined();
    }
    press.celebrate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Quiet" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(press.celebrate).not.toHaveBeenCalled();
  });

  it("[PD-04] no roll and no celebration when the action fails (false) or for a destructive button", () => {
    render(
      <>
        <Button resultLabel="Done" celebrate onClick={() => false}>
          Fails
        </Button>
        <Button variant="destructive" resultLabel="Deleted" celebrate>
          Delete
        </Button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Fails" }));
    expect(screen.getByRole("button", { name: "Fails" })).not.toHaveClass("ok");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(press.celebrate).not.toHaveBeenCalled();
  });

  it("[PD-04] a key press ripples from the centre (molten and destructive only)", () => {
    render(
      <>
        <Button>Molten</Button>
        <Button variant="orbit">Orbit</Button>
      </>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Molten" }), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Molten" }), { key: " " });
    fireEvent.keyDown(screen.getByRole("button", { name: "Molten" }), {
      key: "Enter",
      repeat: true,
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Orbit" }), { key: "Enter" });
    expect(press.ripple).toHaveBeenCalledTimes(2);
    expect(press.ripple.mock.calls[0]).toHaveLength(1); // no event: the centre
  });

  it("[PD-04] loading keeps the label in layout (width kept), is busy, and swallows clicks", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving changes
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Saving changes" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector(".m-txt")).toHaveTextContent("Saving changes");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("[PD-04] a busy or disabled button doesn't press, ripple or lean (design review M1)", () => {
    render(
      <>
        <Button loading>Busy</Button>
        <Button disabled>Off</Button>
      </>,
    );
    for (const name of ["Busy", "Off"]) {
      const b = screen.getByRole("button", { name });
      fireEvent.pointerDown(b, { button: 0, clientX: 5, clientY: 5 });
      expect(b).not.toHaveClass("down");
    }
    expect(press.ripple).not.toHaveBeenCalled();
  });

  it("[PD-04] two clicks before an async action resolves celebrate once (design review M2)", async () => {
    let finish: (v: unknown) => void = () => undefined;
    const pending = new Promise((r) => {
      finish = r;
    });
    render(
      <Button resultLabel="Done" celebrate onClick={() => pending}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Save" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(press.celebrate).toHaveBeenCalledTimes(1);
  });

  it("[PD-04] the ghost button keeps its arrow after the label, inside the underline", () => {
    render(
      <Button variant="ghost" icon={<svg data-testid="arrow" />}>
        Maybe later
      </Button>,
    );
    const u = screen.getByRole("button", { name: "Maybe later" }).querySelector(".u");
    expect(u?.lastElementChild).toBe(screen.getByTestId("arrow"));
  });
});

describe("[PD-04] heart toggle (IconButton round)", () => {
  function animateCalls(): Array<{ el: Element; o: KeyframeAnimationOptions }> {
    const calls: Array<{ el: Element; o: KeyframeAnimationOptions }> = [];
    (Element.prototype as unknown as { animate: unknown }).animate = function (
      this: Element,
      _kf: unknown,
      o: KeyframeAnimationOptions,
    ) {
      calls.push({ el: this, o });
      return { onfinish: null, cancel() {} } as unknown as Animation;
    };
    return calls;
  }

  it("[PD-04] toggles aria-pressed, reports the new state, fills with metal and bursts 10 dots", () => {
    const calls = animateCalls();
    const onChange = vi.fn();
    const { rerender } = render(
      <IconButton
        variant="round"
        icon={MoltenHeart}
        label="Save offer"
        pressed={false}
        onPressedChange={onChange}
      />,
    );
    const btn = screen.getByRole("button", { name: "Save offer" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith(true);
    // The motion follows the value (PD-11): nothing until the parent says it is pressed.
    expect(calls).toHaveLength(0);
    rerender(
      <IconButton
        variant="round"
        icon={MoltenHeart}
        label="Save offer"
        pressed
        onPressedChange={onChange}
      />,
    );
    expect(calls.some((c) => c.o.duration === HEART.popMs)).toBe(true);
    expect(calls.some((c) => c.o.duration === HEART.ringMs)).toBe(true);
    expect(calls.filter((c) => c.o.duration === HEART.dotsMs)).toHaveLength(HEART.dots);
    rerender(
      <IconButton
        variant="round"
        icon={MoltenHeart}
        label="Save offer"
        pressed
        onPressedChange={onChange}
      />,
    );
    expect(btn).toHaveAttribute("aria-pressed", "true");
    const glyph = btn.querySelector("svg:not(.m-defs)");
    expect(glyph?.getAttribute("style")).toMatch(/fill: url\("?#m-metal-/);
  });

  it("[PD-11] a parent that refuses the toggle gets no burst; a change it makes on its own gets none either", () => {
    const calls = animateCalls();
    const onChange = vi.fn();
    const heart = (pressed: boolean) => (
      <IconButton
        variant="round"
        icon={MoltenHeart}
        label="Save offer"
        pressed={pressed}
        onPressedChange={onChange}
      />
    );
    const { rerender } = render(heart(false));
    fireEvent.click(screen.getByRole("button", { name: "Save offer" }));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(heart(false));
    expect(calls).toHaveLength(0);
    const later = vi.spyOn(performance, "now").mockReturnValue(performance.now() + 5000);
    rerender(heart(true));
    later.mockRestore();
    expect(calls).toHaveLength(0);
  });

  it("[PD-04] under reduced motion the heart just fills: no pop, ring or dots", () => {
    const calls = animateCalls();
    document.documentElement.classList.add("rm");
    render(<IconButton variant="round" icon={MoltenHeart} label="Save" pressed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(calls).toHaveLength(0);
  });

  it("[PD-04] without `pressed` it is a plain icon button (no aria-pressed)", () => {
    render(<IconButton variant="round" icon={MoltenHeart} label="Share" />);
    expect(screen.getByRole("button", { name: "Share" })).not.toHaveAttribute("aria-pressed");
  });
});

describe("[PD-04] Tile (C-75)", () => {
  beforeEach(() => {
    class Noop {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", Noop);
    vi.stubGlobal("IntersectionObserver", Noop);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("[PD-04] a fine pointer moves the light (--mx/--my); a touch doesn't", () => {
    render(<Tile data-testid="t">Body</Tile>);
    const tile = screen.getByTestId("t");
    expect(tile).toHaveClass("m-tile", "m-placed");
    expect(tile).toHaveAttribute("data-lift");
    fireEvent.pointerMove(tile, { pointerType: "touch", clientX: 30, clientY: 40 });
    expect(tile.style.getPropertyValue("--mx")).toBe("");
    fireEvent.pointerMove(tile, { pointerType: "mouse", clientX: 30, clientY: 40 });
    expect(tile.style.getPropertyValue("--mx")).toBe("30px");
    expect(tile.style.getPropertyValue("--my")).toBe("40px");
  });
});
