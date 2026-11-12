// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";
import { tabbables, trapTab } from "./focus-trap";
import { Modal } from "./Modal";
import { __scrollLockCount } from "./scroll-lock";
import { SidePanel } from "./SidePanel";

// jsdom has no modal dialog; the browser behaviour that matters here is `open` and the `close` event.
beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

const KINDS = { modal: Modal, panel: SidePanel, sheet: BottomSheet } as const;
type Kind = keyof typeof KINDS;

function Harness({
  kind = "modal",
  children,
  hideTriggerWhenOpen = false,
  label = "Open",
  title = "Edit reward",
}: {
  kind?: Kind;
  children?: ReactNode;
  hideTriggerWhenOpen?: boolean;
  label?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const Overlay = KINDS[kind];
  return (
    <>
      {!(hideTriggerWhenOpen && open) && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          {label}
        </button>
      )}
      <Overlay
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title={title}
        description="Changes apply straight away."
      >
        <button type="button">First action</button>
        {children ?? <button type="button">Last action</button>}
      </Overlay>
    </>
  );
}

/** Open via the trigger; the exit settles on the next microtask in jsdom (no running transitions). */
const openWith = (name = "Open"): void => {
  const trigger = screen.getByRole("button", { name });
  trigger.focus();
  fireEvent.click(trigger);
};
const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};
const key = (k: string, opts: KeyboardEventInit = {}): void => {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ...opts });
};
const dialogs = (): HTMLDialogElement[] => [...document.querySelectorAll("dialog")];

describe.each(Object.keys(KINDS) as Kind[])("[P0-09] %s overlay", (kind) => {
  it("opens as a named, described dialog with focus on the dialog itself", () => {
    render(<Harness kind={kind} />);
    openWith();
    const dialog = screen.getByRole("dialog", { name: "Edit reward" });
    expect(dialog).toHaveProperty("open", true);
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(
      document.getElementById(dialog.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe("Changes apply straight away.");
    expect(document.activeElement?.getAttribute("data-part")).toBe("panel");
    expect(dialog.dataset.state).toBe("open");
  });

  it("Tab and Shift+Tab cycle inside and never leave it", () => {
    render(<Harness kind={kind} />);
    openWith();
    const close = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last action" });
    key("Tab");
    expect(document.activeElement).toBe(close);
    last.focus();
    key("Tab");
    expect(document.activeElement).toBe(close);
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("Esc closes it, focus returns to the trigger and the page scrolls again", async () => {
    render(<Harness kind={kind} />);
    openWith();
    expect(document.documentElement.style.overflow).toBe("hidden");
    key("Escape");
    expect(dialogs()[0]?.dataset.state).toBe("closing");
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
    expect(document.documentElement.style.overflow).toBe("");
    expect(__scrollLockCount()).toBe(0);
  });

  it("the close button and a backdrop tap close it", async () => {
    render(<Harness kind={kind} />);
    openWith();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await settle();
    expect(dialogs()).toHaveLength(0);
    openWith();
    const backdrop = document.querySelector(".overlay-backdrop");
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");
    // A press right after opening is the tail of a double-click on the trigger: ignored.
    if (backdrop) fireEvent.click(backdrop);
    await settle();
    expect(dialogs()).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 320));
    // The second click of a double-click is ignored however late a busy page delivers it.
    if (backdrop) fireEvent.click(backdrop, { detail: 2 });
    await settle();
    expect(dialogs()).toHaveLength(1);
    if (backdrop) fireEvent.click(backdrop);
    await settle();
    expect(dialogs()).toHaveLength(0);
  });

  it("a browser-forced close (no exit) tidies up and tells the parent", async () => {
    render(<Harness kind={kind} />);
    openWith();
    act(() => {
      dialogs()[0]?.close();
    });
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(__scrollLockCount()).toBe(0);
    // The parent's state followed, so the trigger opens it again.
    openWith();
    expect(dialogs()).toHaveLength(1);
  });
});

describe("[P0-09] stacked overlays", () => {
  const Stack = ({ inner = "modal" as Kind }) => (
    <Harness>
      <Harness kind={inner} label="Open inner" title="Inner" />
    </Harness>
  );

  it("Esc closes the top one only; focus returns to its trigger inside the first", async () => {
    render(<Stack />);
    openWith();
    openWith("Open inner");
    expect(dialogs()).toHaveLength(2);
    key("Escape");
    await settle();
    expect(dialogs()).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Edit reward" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open inner" }));
    expect(document.documentElement.style.overflow).toBe("hidden");
    key("Escape");
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("the inner dialog is not inside the outer one's DOM (portal), so its keys never reach it", () => {
    render(<Stack inner="sheet" />);
    openWith();
    openWith("Open inner");
    const [outer, inner] = dialogs();
    expect(outer?.contains(inner ?? null)).toBe(false);
  });

  it("closing in either order leaves the page scrollable", async () => {
    render(<Stack />);
    openWith();
    openWith("Open inner");
    // Outer first: the parent unmounts both at once.
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement);
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(__scrollLockCount()).toBe(0);
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("[P0-09] overlay edge cases", () => {
  it("a trigger clicked but never focused (Safari) still gets focus back", async () => {
    render(<Harness />);
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(dialogs()).toHaveLength(1);
    key("Escape");
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });

  it("trigger removed while open: closing leaves focus on the page, no error", async () => {
    render(<Harness hideTriggerWhenOpen />);
    openWith();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    key("Escape");
    await settle();
    expect(dialogs()).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("reopening mid-exit keeps the same dialog and goes back to open", async () => {
    function Flip() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
            }}
          >
            Toggle
          </button>
          <Modal
            open={open}
            onClose={() => {
              setOpen(false);
            }}
            title="Flip"
          />
        </>
      );
    }
    render(<Flip />);
    const dialog = dialogs()[0];
    expect(dialog?.dataset.state).toBe("open");
    const toggle = screen.getByRole("button", { name: "Toggle", hidden: true });
    fireEvent.click(toggle);
    expect(dialog?.dataset.state).toBe("closing");
    // Reopened before the exit settles: the same dialog goes back to open and the pending close is dropped.
    fireEvent.click(toggle);
    expect(dialogs()).toEqual([dialog]);
    expect(dialog?.dataset.state).toBe("open");
    await settle();
    expect(dialogs()).toEqual([dialog]);
    expect(dialog?.open).toBe(true);
  });

  it("no tabbable content: Tab keeps focus on the container", () => {
    const box = document.createElement("div");
    box.tabIndex = -1;
    box.innerHTML = `<p>Text only</p><button disabled>Off</button><span tabindex="-1">x</span>`;
    document.body.append(box);
    box.focus();
    expect(tabbables(box)).toEqual([]);
    const e = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    trapTab(e, box);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box);
    box.remove();
  });

  it("a radio group is one Tab stop; inert and hidden content is skipped", () => {
    const box = document.createElement("div");
    box.innerHTML = `
      <input type="radio" name="g" value="a"><input type="radio" name="g" value="b" checked>
      <div inert><button>Inert</button></div><div hidden><button>Hidden</button></div>
      <a href="#x">Link</a>`;
    document.body.append(box);
    const names = tabbables(box).map((el) => el.getAttribute("value") ?? el.textContent);
    expect(names).toEqual(["b", "Link"]);
    box.remove();
  });
});

/* ---- BottomSheet drag (pure close rule is in sheet-gesture.test.ts) ---- */

const HEIGHT = 400;

function pointer(
  target: Element,
  type: string,
  { y, t, id = 1, primary = true }: { y: number; t: number; id?: number; primary?: boolean },
): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 });
  Object.defineProperties(e, {
    pointerId: { value: id },
    isPrimary: { value: primary },
    timeStamp: { value: t },
  });
  act(() => {
    target.dispatchEvent(e);
  });
}

function openSheet(): { grip: HTMLElement; panel: HTMLElement } {
  render(<Harness kind="sheet" />);
  openWith();
  const panel = document.querySelector<HTMLElement>('[data-part="panel"]');
  const grip = document.querySelector<HTMLElement>('[data-part="grip"]');
  if (!panel || !grip) throw new Error("sheet parts missing");
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ height: HEIGHT } as DOMRect);
  grip.setPointerCapture = vi.fn();
  grip.releasePointerCapture = vi.fn();
  grip.hasPointerCapture = vi.fn(() => true);
  return { grip, panel };
}

describe("[P0-09] BottomSheet drag", () => {
  it("has a decorative handle, safe-area padding is in the CSS, the grip owns the drag", () => {
    const { grip } = openSheet();
    expect(grip.querySelector(".overlay-handle")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows the finger and springs back from a short slow drag", async () => {
    const { grip, panel } = openSheet();
    pointer(grip, "pointerdown", { y: 100, t: 0 });
    pointer(grip, "pointermove", { y: 140, t: 400 });
    expect(panel.style.transform).toBe("translate3d(0px, 40px, 0px)");
    expect(panel.dataset.dragging).toBe("");
    pointer(grip, "pointerup", { y: 140, t: 800 });
    expect(panel.style.transform).toBe("");
    expect(panel.dataset.dragging).toBeUndefined();
    await settle();
    expect(dialogs()[0]?.dataset.state).toBe("open");
  });

  it("closes after a slow drag past 25% of its height", async () => {
    const { grip } = openSheet();
    pointer(grip, "pointerdown", { y: 100, t: 0 });
    pointer(grip, "pointermove", { y: 150, t: 500 });
    pointer(grip, "pointermove", { y: 201, t: 1000 });
    pointer(grip, "pointerup", { y: 201, t: 1500 });
    expect(dialogs()[0]?.dataset.state).toBe("closing");
    await settle();
    expect(dialogs()).toHaveLength(0);
  });

  it("closes on a short fast flick", async () => {
    const { grip } = openSheet();
    pointer(grip, "pointerdown", { y: 100, t: 1000 });
    pointer(grip, "pointermove", { y: 130, t: 1040 });
    pointer(grip, "pointerup", { y: 130, t: 1050 });
    await settle();
    expect(dialogs()).toHaveLength(0);
  });

  it("pointercancel springs back, even past the threshold", async () => {
    const { grip, panel } = openSheet();
    pointer(grip, "pointerdown", { y: 0, t: 0 });
    pointer(grip, "pointermove", { y: 300, t: 100 });
    pointer(grip, "pointercancel", { y: 300, t: 120 });
    expect(panel.style.transform).toBe("");
    await settle();
    expect(dialogs()[0]?.dataset.state).toBe("open");
  });

  it("ignores a second finger", () => {
    const { grip, panel } = openSheet();
    pointer(grip, "pointerdown", { y: 100, t: 0, id: 1 });
    pointer(grip, "pointerdown", { y: 300, t: 10, id: 2, primary: false });
    pointer(grip, "pointermove", { y: 380, t: 20, id: 2, primary: false });
    expect(panel.style.transform).toBe("");
    pointer(grip, "pointermove", { y: 110, t: 30, id: 1 });
    expect(panel.style.transform).toBe("translate3d(0px, 10px, 0px)");
  });

  it("an upward drag lifts the sheet only a little", () => {
    const { grip, panel } = openSheet();
    pointer(grip, "pointerdown", { y: 300, t: 0 });
    pointer(grip, "pointermove", { y: 0, t: 100 });
    expect(panel.style.transform).toBe("translate3d(0px, -24px, 0px)");
  });

  it("a press on the close button is a tap, not a drag", () => {
    const { panel } = openSheet();
    const close = screen.getByRole("button", { name: "Close" });
    pointer(close, "pointerdown", { y: 0, t: 0 });
    pointer(close, "pointermove", { y: 200, t: 50 });
    expect(panel.style.transform).toBe("");
  });
});
