// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOAST } from "@/lib/motion/controls";
import { Toaster, __resetToasts, dismissToast, toast } from "./Toast";

const LIFE = TOAST.showMs; // 3.6 s, the reference (PD-04)
const EXIT = TOAST.outMs + 40; // a little over the 260 ms exit

/** Messages of the toasts on screen, top to bottom. */
const visible = (): string[] =>
  within(screen.getByRole("region", { name: "Notifications" }))
    .queryAllByRole("listitem")
    .map((li) => li.querySelector('[data-part="message"]')?.textContent ?? "");

const advance = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("[P0-09] toast", () => {
  afterEach(() => {
    act(() => {
      __resetToasts();
    });
    vi.useRealTimers();
  });

  it("shows a toast, announces it politely and removes it after 3.6 s (PD-04)", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("+80 gold added", "success");
    });
    expect(visible()).toEqual(["+80 gold added"]);
    expect(screen.getByRole("status")).toHaveTextContent("+80 gold added");
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    advance(LIFE + EXIT);
    expect(visible()).toEqual([]);
  });

  it("announces an error through the alert region, not the polite one", () => {
    render(<Toaster />);
    act(() => {
      toast("Something went wrong. Please try again.", "error");
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
    expect(screen.getByRole("alert")).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces every toast fired in the same moment, errors and others in their own regions", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Toast 1");
      toast("Toast 2");
      toast("Could not save", "error");
    });
    expect(screen.getByRole("status")).toHaveTextContent("Toast 1 Toast 2");
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save");
    advance(1100);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    // A later toast (the earlier ones have gone) is announced alone.
    advance(5000);
    act(() => {
      toast("Toast 3");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Toast 3$/);
  });

  it("announces a toast that follows another within the second on its own (the first is not read twice)", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Toast A");
    });
    advance(300);
    act(() => {
      toast("Toast B");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Toast B$/);
    // An error arriving next leaves the polite region untouched and is announced alone.
    advance(300);
    act(() => {
      toast("Could not save", "error");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/^Could not save$/);
    expect(screen.getByRole("status")).toHaveTextContent(/^Toast B$/);
    // The one-second clear counts from the last announcement.
    advance(900);
    expect(screen.getByRole("alert")).toHaveTextContent(/^Could not save$/);
    advance(200);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("a reset mid-announcement leaves no stale state: the next toast is announced alone", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Before reset");
      __resetToasts();
      toast("After reset");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^After reset$/);
    // The burst flag was cleared with its timer: a later toast is not joined onto this one.
    advance(300);
    act(() => {
      toast("Later");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Later$/);
  });

  it("a burst with both tones joins neither onto an earlier announcement", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Toast A");
    });
    advance(300);
    // The error comes first in the burst: it must not make the polite region count as "written in this burst".
    act(() => {
      toast("Could not save", "error");
      toast("Toast C");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Toast C$/);
    expect(screen.getByRole("alert")).toHaveTextContent(/^Could not save$/);
  });

  it("the same for errors: a burst that opens with a polite toast doesn't re-read an earlier error", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Could not save", "error");
    });
    advance(300);
    act(() => {
      toast("Toast E");
      toast("Offline", "error");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/^Toast E$/);
    expect(screen.getByRole("alert")).toHaveTextContent(/^Offline$/);
  });

  it("clears the announcement after a second so it is not read twice", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Saved");
    });
    advance(1100);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(visible()).toEqual(["Saved"]);
  });

  it("queues beyond three: every toast appears, in order, none is dropped", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      ["a", "b", "c", "d", "e"].forEach((m) => toast(m));
    });
    expect(visible()).toEqual(["a", "b", "c"]);
    advance(LIFE + EXIT);
    expect(visible()).toEqual(["d", "e"]);
    advance(LIFE + EXIT);
    expect(visible()).toEqual([]);
  });

  it("shows the next waiting toast as soon as one is dismissed", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      ["a", "b", "c", "d"].forEach((m) => toast(m));
    });
    fireEvent.click(
      within(screen.getAllByRole("listitem")[1] as HTMLElement).getByRole("button", {
        name: "Dismiss",
      }),
    );
    advance(EXIT);
    expect(visible()).toEqual(["a", "c", "d"]);
  });

  it("shows the same message twice as two toasts", () => {
    render(<Toaster />);
    act(() => {
      toast("Saved");
      toast("Saved");
    });
    expect(visible()).toEqual(["Saved", "Saved"]);
  });

  it("ignores a second dismiss while the toast is leaving, and an unknown id", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    let id = 0;
    act(() => {
      id = toast("a");
      toast("b");
    });
    act(() => {
      dismissToast(id);
      dismissToast(id);
      dismissToast(9999);
    });
    advance(EXIT);
    expect(visible()).toEqual(["b"]);
  });

  it("pauses the timer while the pointer is over the toast", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Saved");
    });
    const item = screen.getByRole("listitem");
    advance(3000);
    fireEvent.pointerEnter(item);
    advance(10_000);
    expect(visible()).toEqual(["Saved"]);
    fireEvent.pointerLeave(item);
    advance(1000 + EXIT);
    expect(visible()).toEqual([]);
  });

  it("stays paused while focus is inside, even when the pointer leaves (a touch tap ends with pointerleave)", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Saved");
    });
    const item = screen.getByRole("listitem");
    const dismiss = within(item).getByRole("button");
    fireEvent.pointerEnter(item);
    act(() => {
      dismiss.focus();
    });
    fireEvent.pointerLeave(item);
    advance(10_000);
    expect(visible()).toEqual(["Saved"]);
    act(() => {
      dismiss.blur();
    });
    advance(LIFE + EXIT);
    expect(visible()).toEqual([]);
  });

  it("stays paused while hovered, even when focus leaves", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Saved");
    });
    const item = screen.getByRole("listitem");
    const dismiss = within(item).getByRole("button");
    act(() => {
      dismiss.focus();
    });
    fireEvent.pointerEnter(item);
    act(() => {
      dismiss.blur();
    });
    advance(10_000);
    expect(visible()).toEqual(["Saved"]);
    fireEvent.pointerLeave(item);
    advance(LIFE + EXIT);
    expect(visible()).toEqual([]);
  });

  it("can be unmounted with timers pending, and keeps the waiting toasts for the next mount", () => {
    vi.useFakeTimers();
    const first = render(<Toaster />);
    act(() => {
      ["a", "b", "c", "d"].forEach((m) => toast(m));
    });
    first.unmount();
    expect(() => {
      vi.advanceTimersByTime(LIFE * 3);
    }).not.toThrow();
    render(<Toaster />);
    expect(visible()).toEqual(["a", "b", "c"]);
  });
});

describe("[PD-04] Molten toast", () => {
  it("[PD-04] obsidian toast with the metal coin and progress bar; Dismiss stays reachable by keyboard", () => {
    render(<Toaster />);
    act(() => {
      toast("80 gold added at Brew & Bloom Café", "success");
    });
    const item = screen.getByRole("listitem");
    expect(item).toHaveClass("m-toast");
    expect(item.querySelector(".tc")).not.toBeNull();
    expect(item.querySelector(".bar2")).not.toBeNull();
    const dismiss = within(item).getByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveClass("m-toast-x");
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);
  });

  it("[PD-04] enters on the reference's spring with WAAPI (520 ms), coin 800 ms; under reduced motion only fades", () => {
    const calls: Array<{ kf: Keyframe[]; o: KeyframeAnimationOptions }> = [];
    const proto = Element.prototype as unknown as { animate?: unknown };
    const had = proto.animate;
    proto.animate = function (kf: Keyframe[], o: KeyframeAnimationOptions) {
      calls.push({ kf, o });
      return { pause() {}, play() {}, cancel() {}, onfinish: null } as unknown as Animation;
    };
    try {
      render(<Toaster />);
      act(() => {
        toast("Saved", "success");
      });
      const entrance = calls.find((c) => c.o.duration === TOAST.inMs);
      expect(entrance?.kf[0]).toMatchObject({
        opacity: 0,
        transform: "translateY(24px) scale(.96)",
      });
      expect(String(entrance?.o.easing)).toMatch(/linear\(|cubic-bezier\(\.34,1\.56,\.64,1\)/);
      expect(calls.some((c) => c.o.duration === TOAST.coinMs)).toBe(true);
      __resetToasts();
      calls.length = 0;
      document.documentElement.classList.add("rm");
      act(() => {
        toast("Saved", "success");
      });
      const faded = calls.find(
        (c) => c.o.duration !== undefined && c.kf.some((k) => "opacity" in k),
      );
      expect(faded?.kf.every((k) => !("transform" in k))).toBe(true);
      expect(calls.some((c) => c.o.duration === TOAST.coinMs)).toBe(false);
    } finally {
      document.documentElement.classList.remove("rm");
      proto.animate = had;
    }
  });
});
