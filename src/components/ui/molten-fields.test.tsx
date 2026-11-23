// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "@/components/motion/CountUp";
import { FIELD, STARS, TABS } from "@/lib/motion/controls";
import type * as FxModule from "@/lib/motion/fx";
import { RATING_CHOICES, StarRating } from "./StarRating";
import { Tabs } from "./Tabs";
import { TextField } from "./TextField";

const fx = vi.hoisted(() => ({ burst: vi.fn(() => 0) }));
vi.mock("@/lib/motion/fx", async (orig) => ({
  ...(await orig<typeof FxModule>()),
  burst: fx.burst,
}));

const realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);

beforeEach(() => {
  animate.mockClear();
  fx.burst.mockClear();
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

  it("[PD-06] reduced motion: the panel fades in, no slide (DESIGN §7.2)", () => {
    document.documentElement.classList.add("rm");
    render(<TabsHarness />);
    fireEvent.click(screen.getByRole("tab", { name: "Market" }));
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = (animate.mock.calls[0] as unknown as [Keyframe[]])[0];
    expect(frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
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

describe("[PD-06] TextField", () => {
  /** The shakes the field asked for (each a 420 ms translateX run). */
  const shakes = () =>
    animate.mock.calls.filter((call) =>
      String((call as unknown as [Keyframe[]])[0][1]?.transform).includes("translateX(-10px)"),
    );

  it("[PD-06] the label is inside the field; a blank placeholder lets CSS float it once there is a value", () => {
    render(<TextField label="Email address" type="email" />);
    const input = screen.getByLabelText("Email address");
    expect(input).toHaveAttribute("placeholder", " ");
    expect(input.closest(".m-field")?.querySelector("label")).toHaveTextContent("Email address");
    expect(input.closest(".m-field")).not.toHaveAttribute("data-placeholder");
  });

  it("[PD-06] a real placeholder keeps the label up (data-placeholder)", () => {
    render(<TextField label="Shop name" placeholder="e.g. Brew & Bloom Café" />);
    const input = screen.getByLabelText("Shop name");
    expect(input).toHaveAttribute("placeholder", "e.g. Brew & Bloom Café");
    expect(input.closest(".m-field")).toHaveAttribute("data-placeholder");
  });

  it("[PD-06] error and hint stay linked by aria-describedby, with the caller's ids", () => {
    const { rerender } = render(
      <TextField label="Email" hint="We never share it." aria-describedby="extra" />,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAccessibleDescription("We never share it.");
    expect(input.getAttribute("aria-describedby")).toMatch(/-hint extra$/);
    rerender(<TextField label="Email" hint="We never share it." error="Enter an email." />);
    expect(input).toHaveAccessibleDescription("Enter an email.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.closest(".m-field")).toHaveAttribute("data-state", "bad");
  });

  it("[PD-06] a new or changed error shakes the field (420 ms); the same error does not, a new errorKey does", () => {
    const { rerender } = render(<TextField label="Email" />);
    rerender(<TextField label="Email" error="Enter your email address." errorKey={1} />);
    expect(shakes()).toHaveLength(1);
    const opts = (shakes()[0] as unknown as [Keyframe[], KeyframeAnimationOptions])[1];
    expect(opts.duration).toBe(FIELD.shakeMs);
    rerender(<TextField label="Email" error="Enter your email address." errorKey={1} />);
    expect(shakes()).toHaveLength(1);
    rerender(<TextField label="Email" error="That email looks incomplete." errorKey={1} />);
    expect(shakes()).toHaveLength(2);
    // A second failed submit with the same message: the form bumps errorKey.
    rerender(<TextField label="Email" error="That email looks incomplete." errorKey={2} />);
    expect(shakes()).toHaveLength(3);
    // Clearing the error never shakes.
    rerender(<TextField label="Email" errorKey={2} />);
    expect(shakes()).toHaveLength(3);
  });

  it("[PD-06] no shake for an error already there on first render, nor under reduced motion", () => {
    const { unmount } = render(<TextField label="Email" error="Enter an email." />);
    expect(shakes()).toHaveLength(0);
    unmount();
    document.documentElement.classList.add("rm");
    const { rerender } = render(<TextField label="Email" />);
    rerender(<TextField label="Email" error="Enter an email." />);
    expect(shakes()).toHaveLength(0);
  });

  it("[PD-06] the beam runs out from the tap point; keyboard focus runs it from the centre", () => {
    render(<TextField label="Email" />);
    const input = screen.getByLabelText("Email");
    const field = input.closest<HTMLElement>(".m-field");
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 0, 200, 58));
    fireEvent.pointerDown(input, { clientX: 150 });
    expect(field?.style.getPropertyValue("--ox")).toBe("25%");
    // The tap's own focus (iOS focuses after the touch ends) keeps the tap point.
    fireEvent.focus(input);
    expect(field?.style.getPropertyValue("--ox")).toBe("25%");
  });

  it("[PD-06] keyboard focus with no press before it runs the beam from the centre", () => {
    render(<TextField label="Email" />);
    const input = screen.getByLabelText("Email");
    const field = input.closest<HTMLElement>(".m-field");
    field?.style.setProperty("--ox", "80%"); // left over from an earlier tap
    fireEvent.focus(input);
    expect(field?.style.getPropertyValue("--ox")).toBe("");
  });

  it("[PD-06] valid draws the tick (data-state good); an error wins over valid", () => {
    const { rerender } = render(<TextField label="Email" valid />);
    const field = screen.getByLabelText("Email").closest(".m-field");
    expect(field).toHaveAttribute("data-state", "good");
    rerender(<TextField label="Email" valid error="No." />);
    expect(field).toHaveAttribute("data-state", "bad");
  });
});

describe("[PD-06] StarRating", () => {
  function Rate({ refuse = false }: { refuse?: boolean }) {
    const [v, setV] = useState(0);
    return (
      <StarRating
        value={v}
        onChange={(n) => {
          if (!refuse) setV(n);
        }}
      />
    );
  }
  const lit = (): number => document.querySelectorAll(".m-star.lit").length;
  const pops = () =>
    animate.mock.calls.filter((call) =>
      String((call as unknown as [Keyframe[]])[0][0]?.transform).startsWith("scale(.6)"),
    );

  it("[PD-06] COMPLIANCE §1: every rating, 1 to 5, gets the same two choices, identical in look, order and state", () => {
    const actions: string[] = [];
    for (const n of [1, 2, 3, 4, 5]) {
      const { container, unmount } = render(
        <StarRating value={n} onChange={() => undefined} onChoice={() => undefined} />,
      );
      const group = container.querySelector<HTMLElement>(".m-rate-actions");
      if (!group) throw new Error("no choices");
      const buttons = [...group.querySelectorAll("button")];
      expect(buttons.map((b) => b.textContent)).toEqual([...RATING_CHOICES]);
      expect(buttons.map((b) => b.className)).toEqual(["", ""]);
      for (const b of buttons) expect(b).toBeEnabled();
      expect(group).not.toHaveAttribute("inert");
      actions.push(group.outerHTML);
      unmount();
    }
    expect(new Set(actions).size).toBe(1);
    expect(RATING_CHOICES).toEqual(["Post on Google", "Send to the shop privately"]);
  });

  it("[PD-06] COMPLIANCE §1: a choice reports itself and the rating, the same way for a 1 and a 5", () => {
    const onChoice = vi.fn();
    for (const n of [1, 5]) {
      const { unmount } = render(
        <StarRating value={n} onChange={() => undefined} onChoice={onChoice} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Post on Google" }));
      fireEvent.click(screen.getByRole("button", { name: "Send to the shop privately" }));
      unmount();
    }
    expect(onChoice.mock.calls).toEqual([
      ["Post on Google", 1],
      ["Send to the shop privately", 1],
      ["Post on Google", 5],
      ["Send to the shop privately", 5],
    ]);
  });

  it("[PD-06] before a rating the choices keep their space but are inert; the word says Tap a star", () => {
    const { container } = render(<Rate />);
    expect(container.querySelector(".m-rate-actions")).toHaveAttribute("inert");
    expect(screen.getByText("Tap a star")).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "1 star" })).toHaveAttribute("tabindex", "0");
  });

  it("[PD-06] stars ignite one after another, 70 ms apart, each popping 480 ms with 7 sparks", () => {
    vi.useFakeTimers();
    try {
      render(<Rate />);
      fireEvent.click(screen.getByRole("radio", { name: "3 stars" }));
      expect(screen.getByText("Good")).toBeInTheDocument();
      expect(lit()).toBe(0);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(lit()).toBe(1);
      act(() => {
        vi.advanceTimersByTime(STARS.staggerMs);
      });
      expect(lit()).toBe(2);
      act(() => {
        vi.advanceTimersByTime(STARS.staggerMs);
      });
      expect(lit()).toBe(3);
      expect(pops()).toHaveLength(3);
      const opts = (pops()[0] as unknown as [Keyframe[], KeyframeAnimationOptions])[1];
      expect(opts.duration).toBe(STARS.popMs);
      expect(fx.burst).toHaveBeenCalledTimes(3);
      expect(fx.burst.mock.calls[0]).toEqual([
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ type: "spark", count: STARS.sparks }),
      ]);
      expect(screen.getByRole("radio", { name: "3 stars" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      // A lower rating puts out the stars past it at once.
      fireEvent.click(screen.getByRole("radio", { name: "1 star" }));
      expect(lit()).toBe(1);
      expect(screen.getByText("Poor")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("[PD-06] a parent that refuses the rating gets no ignite; reduced motion lights at once with no pop or sparks", () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<Rate refuse />);
      fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
      act(() => {
        vi.runAllTimers();
      });
      expect(lit()).toBe(0);
      unmount();
      document.documentElement.classList.add("rm");
      render(<Rate />);
      fireEvent.click(screen.getByRole("radio", { name: "5 stars" }));
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(lit()).toBe(5);
      expect(pops()).toHaveLength(0);
      expect(fx.burst).not.toHaveBeenCalled();
      // The word fades in without rising (DESIGN §7.2): no call moves anything.
      expect(
        animate.mock.calls.filter((call) =>
          (call as unknown as [Keyframe[]])[0].some((k) => "transform" in k),
        ),
      ).toHaveLength(0);
      expect(animate).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("[PD-06] arrow keys move and rate without wrapping; one tab stop on the rating", () => {
    render(<Rate />);
    const star = (n: number) =>
      screen.getByRole("radio", { name: n === 1 ? "1 star" : `${String(n)} stars` });
    act(() => {
      star(1).focus();
    });
    fireEvent.keyDown(star(1), { key: "ArrowRight" });
    expect(star(2)).toHaveAttribute("aria-checked", "true");
    expect(star(2)).toHaveFocus();
    fireEvent.keyDown(star(2), { key: "ArrowLeft" });
    fireEvent.keyDown(star(1), { key: "ArrowLeft" });
    expect(star(1)).toHaveAttribute("aria-checked", "true");
    for (let i = 0; i < 6; i++)
      fireEvent.keyDown(document.activeElement ?? star(1), { key: "ArrowRight" });
    expect(star(5)).toHaveAttribute("aria-checked", "true");
    expect(document.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
    expect(star(5)).toHaveAttribute("tabindex", "0");
  });

  it("[PD-06] Down/Up arrows move and rate like Right/Left (WAI-ARIA radio group), without wrapping", () => {
    render(<Rate />);
    const star = (n: number) =>
      screen.getByRole("radio", { name: n === 1 ? "1 star" : `${String(n)} stars` });
    act(() => {
      star(1).focus();
    });
    fireEvent.keyDown(star(1), { key: "ArrowDown" });
    expect(star(2)).toHaveAttribute("aria-checked", "true");
    expect(star(2)).toHaveFocus();
    fireEvent.keyDown(star(2), { key: "ArrowUp" });
    fireEvent.keyDown(star(1), { key: "ArrowUp" });
    expect(star(1)).toHaveAttribute("aria-checked", "true");
    expect(star(1)).toHaveFocus();
    for (let i = 0; i < 6; i++)
      fireEvent.keyDown(document.activeElement ?? star(1), { key: "ArrowDown" });
    expect(star(5)).toHaveAttribute("aria-checked", "true");
  });
});
