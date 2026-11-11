// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, __resetToasts, dismissToast, toast } from "./Toast";

const LIFE = 4000;
const EXIT = 200; // a little over the 160ms exit

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

  it("shows a toast, announces it politely and removes it after 4s", () => {
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
