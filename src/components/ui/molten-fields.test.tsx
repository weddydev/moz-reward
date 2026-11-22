// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "@/components/motion/CountUp";
import { TABS } from "@/lib/motion/controls";
import { Tabs } from "./Tabs";

const realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);

beforeEach(() => {
  animate.mockClear();
  // jsdom has no Web Animations: a stub records what the components ask for.
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
});
afterEach(() => {
  if (realAnimate) Object.defineProperty(Element.prototype, "animate", realAnimate);
  else Reflect.deleteProperty(Element.prototype, "animate");
  document.documentElement.classList.remove("rm");
  vi.restoreAllMocks();
});

type Three = "wallet" | "offers" | "market";
const THREE = [
  { value: "wallet", label: "Wallet" },
  { value: "offers", label: "Offers" },
  { value: "market", label: "Market" },
] as const;

function TabsHarness({
  items = THREE,
  refuse = false,
}: {
  items?: ReadonlyArray<{ value: string; label: string }>;
  refuse?: boolean;
}) {
  const [v, setV] = useState<string>(items[0]?.value ?? "");
  return (
    <Tabs
      label="Sections"
      items={items}
      value={v}
      onChange={(next) => {
        if (!refuse) setV(next);
      }}
    >
      <p>panel {v}</p>
    </Tabs>
  );
}

/** The panel slides the tabs asked for, as `translateX` start offsets in px. */
const slides = (): number[] =>
  animate.mock.calls.map((call) => {
    const frames = (call as unknown as [Keyframe[]])[0];
    return Number(/translateX\((-?\d+)px\)/.exec(String(frames[0]?.transform))?.[1]);
  });

describe("[PD-06] Tabs", () => {
  it("[PD-06] the pill sits by CSS alone: --n tabs and --i chosen, right in the server render", () => {
    const html = renderToString(
      <Tabs<Three> label="Sections" items={THREE} value="offers" onChange={() => undefined}>
        <p>x</p>
      </Tabs>,
    );
    expect(html).toContain("--n:3");
    expect(html).toContain("--i:1");
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Offers/);
  });

  it("[PD-06] 2 and 4 tabs: --n follows, the pill moves to the chosen one", () => {
    const two = [
      { value: "a", label: "One" },
      { value: "b", label: "Two" },
    ];
    const four = [...two, { value: "c", label: "Three" }, { value: "d", label: "Four" }];
    const { unmount } = render(<TabsHarness items={two} />);
    expect(screen.getByRole("tablist").style.getPropertyValue("--n")).toBe("2");
    unmount();
    render(<TabsHarness items={four} />);
    const list = screen.getByRole("tablist");
    expect(list.style.getPropertyValue("--n")).toBe("4");
    fireEvent.click(screen.getByRole("tab", { name: "Four" }));
    expect(list.style.getPropertyValue("--i")).toBe("3");
  });

  it("[PD-06] the panel slides 32 px in from the side you moved toward, for 380 ms, never on first render", () => {
    render(<TabsHarness />);
    expect(animate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Market" }));
    fireEvent.click(screen.getByRole("tab", { name: "Wallet" }));
    expect(slides()).toEqual([TABS.panelShiftPx, -TABS.panelShiftPx]);
    const opts = (animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions])[1];
    expect(opts.duration).toBe(TABS.panelMs);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel wallet");
  });

  it("[PD-06] a parent that refuses the change gets no slide (the motion follows the value)", () => {
    render(<TabsHarness refuse />);
    fireEvent.click(screen.getByRole("tab", { name: "Offers" }));
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Wallet" })).toHaveAttribute("aria-selected", "true");
  });

  it("[PD-06] clicking the chosen tab again does nothing", () => {
    const onChange = vi.fn();
    render(
      <Tabs<Three> label="Sections" items={THREE} value="wallet" onChange={onChange}>
        <p>x</p>
      </Tabs>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Wallet" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[PD-06] arrows wrap and move focus; Home and End jump; the tab stop roves", () => {
    render(<TabsHarness />);
    const tab = (name: string) => screen.getByRole("tab", { name });
    act(() => {
      tab("Wallet").focus();
    });
    fireEvent.keyDown(tab("Wallet"), { key: "ArrowLeft" });
    expect(tab("Market")).toHaveAttribute("aria-selected", "true");
    expect(tab("Market")).toHaveFocus();
    expect(tab("Market")).toHaveAttribute("tabindex", "0");
    expect(tab("Wallet")).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(tab("Market"), { key: "ArrowRight" });
    expect(tab("Wallet")).toHaveFocus();
    fireEvent.keyDown(tab("Wallet"), { key: "End" });
    expect(tab("Market")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Market"), { key: "Home" });
    expect(tab("Wallet")).toHaveAttribute("aria-selected", "true");
    // The panel is labelled by the chosen tab and every tab controls it.
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tab("Wallet").id);
    expect(tab("Offers")).toHaveAttribute("aria-controls", panel.id);
  });

  it("[PD-06] counts render beside the label", () => {
    render(
      <Tabs
        label="Requests"
        items={[
          { value: "p", label: "Pending", count: 3 },
          { value: "a", label: "Approved" },
        ]}
        value="p"
        onChange={() => undefined}
      >
        <p>x</p>
      </Tabs>,
    );
    expect(screen.getByRole("tab", { name: "Pending 3" })).toBeInTheDocument();
  });
});

describe("[PD-06] CountUp", () => {
  let frame: FrameRequestCallback = () => undefined;
  let raf: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frame = cb;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(performance, "now").mockReturnValue(1000);
  });

  it("[PD-06] the server render shows the value; the moving digits are hidden, a still copy is read", () => {
    const html = renderToString(<CountUp value={2480} />);
    expect(html).toContain('aria-hidden="true">2,480</span>');
    expect(html).toContain('class="sr-only">2,480</span>');
  });

  it("[PD-06] mounted on the client (a tab shown), it counts from 0, writing only in frames", () => {
    render(<CountUp value={480} ms={TABS.countUpMs} />);
    const digits = document.querySelector('[aria-hidden="true"]');
    // Nothing written before the first frame (it runs before paint): the end value stays until then.
    expect(digits).toHaveTextContent("480");
    frame(1000);
    expect(digits).toHaveTextContent("0");
    frame(1000 + TABS.countUpMs / 2); // cubic out: 87.5% at half time
    expect(digits).toHaveTextContent("420");
    frame(1000 + TABS.countUpMs);
    expect(digits).toHaveTextContent("480");
    expect(document.querySelector(".sr-only")).toHaveTextContent("480");
  });

  it("[PD-06] reduced motion: the value shows at once, no frames", () => {
    document.documentElement.classList.add("rm");
    render(<CountUp value={48} />);
    expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent("48");
    expect(raf).not.toHaveBeenCalled();
  });
});
