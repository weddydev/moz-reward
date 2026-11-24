// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blobKeyframes, DOCK, dropKeyframes, keyboardOpen } from "@/lib/motion/controls";
import type * as FxModule from "@/lib/motion/fx";
import { isEditable } from "@/lib/use-keyboard-open";
import { Dock, DOCK_ITEM, DOCK_SCAN, scanPress } from "./Dock";
import { DOCK_ICONS } from "./dock-icons";

const fx = vi.hoisted(() => ({ burst: vi.fn(() => 0) }));
vi.mock("@/lib/motion/fx", async (orig) => ({
  ...(await orig<typeof FxModule>()),
  burst: fx.burst,
}));

/** A dock of the reference's five: Wallet, Offers, Scan, Market, Me. */
function FiveDock({ active, column }: { active: number; column: number }): React.JSX.Element {
  return (
    <Dock label="App" active={active} column={column} columns={5}>
      {["Wallet", "Offers"].map((l, i) => (
        <button
          key={l}
          type="button"
          data-liq
          aria-current={i === active ? "page" : undefined}
          className={DOCK_ITEM}
        >
          {l}
        </button>
      ))}
      <button type="button" className={DOCK_SCAN} aria-label="Scan" />
      {["Market", "Me"].map((l, k) => (
        <button
          key={l}
          type="button"
          data-liq
          aria-current={k + 2 === active ? "page" : undefined}
          className={DOCK_ITEM}
        >
          {l}
        </button>
      ))}
    </Dock>
  );
}

let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
class FakeIO {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observed.push(cb);
  }
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  fx.burst.mockClear();
  observed = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("rm");
});

describe("[PD-07] dock geometry and keyboard (pure)", () => {
  it("[PD-07] a column pours the same way turned 90°: translateY, the stretch along the run", () => {
    const a = { x: 0, w: 44, c: 22 };
    const b = { x: 96, w: 44, c: 118 };
    expect(blobKeyframes(a, b, undefined, "y")).toEqual([
      { transform: "translateY(0px) scale(1,1)" },
      { transform: "translateY(48px) scale(.76,1.3)", offset: 0.42 },
      { transform: "translateY(100px) scale(1.1,.92)", offset: 0.76 },
      { transform: "translateY(96px) scale(1,1)" },
    ]);
    // The droplet bows sideways instead of up.
    expect(dropKeyframes(a, b, 0, undefined, "y")[1]?.transform).toBe(
      "translateY(57px) translateX(-12px) scale(1)",
    );
    // A row is unchanged (PD-05 strings).
    expect(blobKeyframes(a, b)[1]?.transform).toBe("translateX(48px) scale(1.3,.76)");
  });

  it("[PD-07] the keyboard is open only with an editable focus and a visual viewport ≥ 150 px shorter", () => {
    expect(keyboardOpen(844, 500, true)).toBe(true);
    expect(keyboardOpen(844, 844 - DOCK.keyboardMinPx, true)).toBe(true);
    // The iOS toolbar collapsing or expanding is a small change.
    expect(keyboardOpen(844, 790, true)).toBe(false);
    // Pinch zoom shrinks the visual viewport with nothing to type into.
    expect(keyboardOpen(844, 400, false)).toBe(false);
  });

  it("[PD-07] text inputs, text areas and contenteditable bring up a keyboard; buttons, checkboxes, ranges don't", () => {
    const make = (html: string): Element | null => {
      const box = document.createElement("div");
      box.innerHTML = html;
      return box.firstElementChild;
    };
    expect(isEditable(make('<input type="email">'))).toBe(true);
    expect(isEditable(make("<input>"))).toBe(true);
    expect(isEditable(make("<textarea></textarea>"))).toBe(true);
    expect(isEditable(make('<input type="checkbox">'))).toBe(false);
    expect(isEditable(make('<input type="range">'))).toBe(false);
    expect(isEditable(make("<input readonly>"))).toBe(false);
    expect(isEditable(make("<input disabled>"))).toBe(false);
    expect(isEditable(make("<button>Go</button>"))).toBe(false);
    expect(isEditable(make("<select></select>"))).toBe(false);
    expect(isEditable(null)).toBe(false);
  });

  it("[PD-07] the reference's own icons cover the five customer items", () => {
    expect(Object.keys(DOCK_ICONS).sort()).toEqual(
      ["CircleUser", "ScanLine", "Store", "Tag", "Wallet"].sort(),
    );
  });
});

describe("[PD-07] Dock", () => {
  it("[PD-07] renders a labelled nav: goo with one blob and one droplet, items in order", () => {
    render(<FiveDock active={0} column={0} />);
    const nav = screen.getByRole("navigation", { name: "App" });
    expect(nav).toHaveClass("m-dock");
    expect(nav.dataset.placement).toBe("fixed");
    const goo = nav.querySelector(".m-goo");
    expect(goo).toHaveAttribute("aria-hidden", "true");
    expect(goo?.querySelectorAll(".m-blob")).toHaveLength(1);
    expect(goo?.querySelectorAll(".m-drop")).toHaveLength(1);
    expect(
      screen.getAllByRole("button").map((b) => b.textContent || b.getAttribute("aria-label")),
    ).toEqual(["Wallet", "Offers", "Scan", "Market", "Me"]);
  });

  it("[PD-07] before hydration CSS alone puts the gold on the current column (Market is column 3 of 5)", () => {
    const html = renderToString(<FiveDock active={2} column={3} />);
    expect(html).toContain("width:calc((100% - 12px) / 5)");
    expect(html).toContain("transform:translateX(calc(6px + 3 * 100%))");
    expect(html).toContain("left:calc(6px + (3 + .5) * (100% - 12px) / 5 - 13px)");
  });

  it("[PD-07] with no current item (the Scan page) the dock is marked empty so the gold drains", () => {
    render(<FiveDock active={-1} column={-1} />);
    expect(screen.getByRole("navigation").dataset.empty).toBe("");
  });

  it("[PD-07] draining on the Scan page leaves the gold where it was (no jump to the first item)", () => {
    const { rerender } = render(<FiveDock active={2} column={3} />);
    const nav = screen.getByRole("navigation");
    const blob = nav.querySelector<HTMLElement>(".m-blob");
    const drop = nav.querySelector<HTMLElement>(".m-drop");
    const before = [blob?.style.transform, drop?.style.left, drop?.style.transform];
    rerender(<FiveDock active={-1} column={-1} />);
    expect(nav.dataset.empty).toBe("");
    expect([blob?.style.transform, drop?.style.left, drop?.style.transform]).toEqual(before);
  });

  it("[PD-07] a new current item pours the gold: blob and droplet animate, nothing queues", () => {
    const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
    // jsdom has no Web Animations: the pour goes through `el.animate` when it exists.
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
    // jsdom has no layout: give each item a box from its column.
    const boxes = vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      const items = [...(this.parentElement?.children ?? [])].filter((e) =>
        e.matches("[data-liq], .m-scan"),
      );
      return 6 + items.indexOf(this) * 60;
    });
    const widths = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(60);
    const { rerender } = render(<FiveDock active={0} column={0} />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<FiveDock active={1} column={1} />);
    const frames = animate.mock.calls.map((c) => (c as unknown as [Keyframe[]])[0]);
    expect(frames).toHaveLength(2); // blob + one droplet
    expect(frames[0]?.at(-1)).toEqual({ transform: "translateX(66px) scale(1,1)" });
    Reflect.deleteProperty(Element.prototype, "animate");
    boxes.mockRestore();
    widths.mockRestore();
  });

  it("[PD-07] loops sleep off screen and while the tab is hidden", () => {
    render(<FiveDock active={0} column={0} />);
    const nav = screen.getByRole("navigation");
    expect(nav).not.toHaveAttribute("data-paused");
    act(() => {
      observed[0]?.([{ isIntersecting: false }]);
    });
    expect(nav).toHaveAttribute("data-paused");
    act(() => {
      observed[0]?.([{ isIntersecting: true }]);
    });
    expect(nav).not.toHaveAttribute("data-paused");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    expect(nav).toHaveAttribute("data-paused");
    hidden.mockRestore();
  });

  it("[PD-07] the fixed dock slides away while the keyboard is open, and comes back", () => {
    const vv = Object.assign(new EventTarget(), { height: 844 });
    vi.stubGlobal("visualViewport", vv);
    vi.stubGlobal("innerHeight", 844);
    render(
      <>
        <input aria-label="Email" />
        <FiveDock active={0} column={0} />
      </>,
    );
    const nav = screen.getByRole("navigation");
    act(() => {
      screen.getByRole("textbox", { name: "Email" }).focus();
      vv.height = 480;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(nav.dataset.keyboard).toBe("");
    act(() => {
      vv.height = 844;
      vv.dispatchEvent(new Event("resize"));
    });
    expect(nav.dataset.keyboard).toBeUndefined();
  });

  it("[PD-07] a keyboard already open when the dock mounts (a field focused before hydration) hides it at once", () => {
    // CI 45128513936 (Linux WebKit): the field was focused and the keyboard opened before the shell hydrated, so
    // both events were missed and the dock stayed up.
    const vv = Object.assign(new EventTarget(), { height: 480 });
    vi.stubGlobal("visualViewport", vv);
    vi.stubGlobal("innerHeight", 844);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    render(<FiveDock active={0} column={0} />);
    expect(screen.getByRole("navigation").dataset.keyboard).toBe("");
    field.remove();
  });

  it("[PD-07] Scan presses (500 ms) and bursts 26 sparks from its centre; reduced motion: no sparks", () => {
    const animate = vi.fn(() => null);
    const el = document.createElement("button");
    el.animate = animate as never;
    el.getBoundingClientRect = () => ({ left: 100, top: 700, width: 62, height: 62 }) as DOMRect;
    scanPress(el);
    expect(fx.burst).toHaveBeenCalledWith(131, 731, {
      type: "spark",
      count: 26,
      speed: [160, 400],
    });
    expect(animate).toHaveBeenCalledWith(
      DOCK.scanPressKeyframes,
      expect.objectContaining({ duration: 500 }),
    );
    fx.burst.mockClear();
    document.documentElement.classList.add("rm");
    scanPress(el);
    expect(fx.burst).not.toHaveBeenCalled();
  });
});
