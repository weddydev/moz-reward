// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blobKeyframes,
  dropKeyframes,
  LIQUID,
  nextEnabled,
  SEAL,
  SWITCH,
} from "@/lib/motion/controls";
import type * as FxModule from "@/lib/motion/fx";
import { Checkbox } from "./Checkbox";
import { LiquidChoice } from "./LiquidChoice";
import { RadioGroup } from "./Radio";
import { SegmentedControl } from "./SegmentedControl";
import { Switch } from "./Switch";

const fx = vi.hoisted(() => ({ burst: vi.fn(() => 0) }));
vi.mock("@/lib/motion/fx", async (orig) => ({
  ...(await orig<typeof FxModule>()),
  burst: fx.burst,
}));

beforeEach(() => {
  fx.burst.mockClear();
  // Hydrated (C-20): controlled controls are enabled.
  document.documentElement.dataset.hydrated = "true";
});
afterEach(() => {
  vi.useRealTimers();
  document.documentElement.classList.remove("rm");
});

describe("[PD-05] liquid geometry (pure)", () => {
  const a = { x: 5, w: 100, c: 55 };
  const b = { x: 105, w: 100, c: 155 };

  it("[PD-05] the blob stretches halfway at 42%, overshoots 4 px at 76% and settles on the target", () => {
    expect(blobKeyframes(a, b)).toEqual([
      { transform: "translateX(5px) scale(1,1)" },
      { transform: "translateX(55px) scale(1.3,.76)", offset: 0.42 },
      { transform: "translateX(109px) scale(.92,1.1)", offset: 0.76 },
      { transform: "translateX(105px) scale(1,1)" },
    ]);
    // Leftwards, the overshoot is to the left.
    expect(blobKeyframes(b, a)[2]).toEqual({
      transform: "translateX(1px) scale(.92,1.1)",
      offset: 0.76,
    });
  });

  it("[PD-05] a second choice mid-pour starts from the gold's current shape, not a round blob", () => {
    const mid = "matrix(1.3, 0, 0, 0.76, 55, 0)";
    const frames = blobKeyframes(a, b, mid);
    expect(frames[0]).toEqual({ transform: mid });
    expect(frames.slice(1)).toEqual(blobKeyframes(a, b).slice(1));
    const drop = "matrix(1, 0, 0, 1, 80, -12)";
    expect(dropKeyframes(a, b, 0, drop)[0]).toEqual({ transform: drop });
    expect(dropKeyframes(a, b, 0, drop).slice(1)).toEqual(dropKeyframes(a, b, 0).slice(1));
  });

  it("[PD-05] the first droplet rises 12 px, the second dips 14 px, both by their centre", () => {
    expect(dropKeyframes(a, b, 0)).toEqual([
      { transform: "translateX(42px) translateY(0) scale(.7)" },
      { transform: "translateX(92px) translateY(-12px) scale(1)", offset: 0.5 },
      { transform: "translateX(142px) translateY(0) scale(.6)" },
    ]);
    expect(dropKeyframes(a, b, 1)[1]?.transform).toBe("translateX(92px) translateY(14px) scale(1)");
  });

  it("[PD-05] arrow keys wrap and skip disabled options; with all disabled nothing moves", () => {
    expect(nextEnabled([false, false, false], 2, 1)).toBe(0);
    expect(nextEnabled([false, false, false], 0, -1)).toBe(2);
    expect(nextEnabled([false, true, false], 0, 1)).toBe(2);
    expect(nextEnabled([false, true, false, true], 2, 1)).toBe(0);
    expect(nextEnabled([true, true], 0, 1)).toBe(0);
  });
});

function ControlledSwitch({ start = false }: { start?: boolean }): React.JSX.Element {
  const [on, setOn] = useState(start);
  return (
    <Switch
      label="Points approved alerts"
      description="When a shop approves your visit"
      checked={on}
      onCheckedChange={setOn}
    />
  );
}

describe("[PD-05] Coin switch", () => {
  it("[PD-05] role=switch named by its label, described by its description, with the coin, faces and fill", () => {
    render(<ControlledSwitch />);
    const sw = screen.getByRole("switch", { name: "Points approved alerts" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(sw).toHaveAccessibleDescription("When a shop approves your visit");
    for (const part of [".m-tgl-fill", ".m-tgl-coin", ".m-coin-in", ".m-f1", ".m-f2 svg"])
      expect(sw.querySelector(part), part).not.toBeNull();
    expect(sw.querySelector(".m-f1")).toHaveTextContent("M");
  });

  it("[PD-05] turning on lands with 16 sparks at 420 ms; turning off before then cancels the landing", () => {
    vi.useFakeTimers();
    render(<ControlledSwitch />);
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    act(() => {
      vi.advanceTimersByTime(SWITCH.landMs - 1);
    });
    expect(fx.burst).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fx.burst).toHaveBeenCalledTimes(1);
    expect(fx.burst).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ type: "spark", count: 16, speed: [120, 340] }),
    );
    // Rapid toggling: on → off within 420 ms never lands.
    fx.burst.mockClear();
    fireEvent.click(sw); // off
    fireEvent.click(sw); // on
    fireEvent.click(sw); // off
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-05] reduced motion: the state changes with no sparks", () => {
    vi.useFakeTimers();
    document.documentElement.classList.add("rm");
    render(<ControlledSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-05] disabled: no change, no sparks", () => {
    const onChange = vi.fn();
    render(<Switch label="Sounds" checked={false} onCheckedChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

const REWARDS = [
  { value: "coffee", label: "Coffee", detail: "600 gold" },
  { value: "cake", label: "Cake", detail: "800 gold" },
  { value: "both", label: "Both", detail: "1,000 gold" },
] as const;

function Rewards({
  onChange,
  disabledBoth = false,
}: {
  onChange?: (v: string) => void;
  disabledBoth?: boolean;
}): React.JSX.Element {
  const [v, setV] = useState<string>("coffee");
  return (
    <LiquidChoice
      label="Choose your reward"
      value={v}
      onChange={(next) => {
        setV(next);
        onChange?.(next);
      }}
      options={REWARDS.map((o) => (o.value === "both" ? { ...o, disabled: disabledBoth } : o))}
    />
  );
}

describe("[PD-05] Liquid choice", () => {
  it("[PD-05] a named radiogroup of radios with the goo layer (blob + two droplets) and a roving tabindex", () => {
    render(<Rewards />);
    const group = screen.getByRole("radiogroup", { name: "Choose your reward" });
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(radios[0]).toHaveAccessibleName("Coffee 600 gold");
    const goo = group.querySelector(".m-goo");
    expect(goo).toHaveAttribute("aria-hidden", "true");
    expect(goo?.querySelectorAll(".m-blob")).toHaveLength(1);
    expect(goo?.querySelectorAll(".m-drop")).toHaveLength(2);
  });

  it("[PD-05] a click chooses; sparks rise over the choice at 520 ms (none when switched off)", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Rewards onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /Cake/ }));
    expect(onChange).toHaveBeenCalledWith("cake");
    expect(screen.getByRole("radio", { name: /Cake/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Cake/ }).tabIndex).toBe(0);
    act(() => {
      vi.advanceTimersByTime(LIQUID.sparkAtMs - 1);
    });
    expect(fx.burst).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fx.burst).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ type: "spark", count: 10, speed: [80, 220] }),
    );
    // Choosing the current option again does nothing.
    onChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: /Cake/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("[PD-11] the sparks follow the value: a parent that refuses the choice gets none, and focus stays put", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <LiquidChoice
        label="Choose your reward"
        value="coffee"
        onChange={onChange}
        options={REWARDS}
      />,
    );
    const coffee = screen.getByRole("radio", { name: /Coffee/ });
    coffee.focus();
    fireEvent.keyDown(coffee, { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenCalledWith("cake");
    expect(coffee).toHaveAttribute("aria-checked", "true");
    expect(coffee).toHaveFocus();
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-11] arrows accepted: focus moves with the choice and the sparks rise", () => {
    vi.useFakeTimers();
    render(<Rewards />);
    const coffee = screen.getByRole("radio", { name: /Coffee/ });
    coffee.focus();
    fireEvent.keyDown(coffee, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /Cake/ })).toHaveFocus();
    act(() => {
      vi.advanceTimersByTime(LIQUID.sparkAtMs);
    });
    expect(fx.burst).toHaveBeenCalledTimes(1);
  });

  it("[PD-05] sparks={false}: no sparks", () => {
    vi.useFakeTimers();
    render(
      <LiquidChoice
        label="Rating"
        defaultValue="1"
        sparks={false}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-05] arrow keys move, select and focus (wrapping, skipping a disabled option)", () => {
    const onChange = vi.fn();
    render(<Rewards onChange={onChange} disabledBoth />);
    const coffee = screen.getByRole("radio", { name: /Coffee/ });
    coffee.focus();
    fireEvent.keyDown(coffee, { key: "ArrowRight" });
    const cake = screen.getByRole("radio", { name: /Cake/ });
    expect(cake).toHaveFocus();
    expect(cake).toHaveAttribute("aria-checked", "true");
    // Both is disabled: Right wraps to Coffee.
    fireEvent.keyDown(cake, { key: "ArrowDown" });
    expect(coffee).toHaveFocus();
    expect(onChange).toHaveBeenNthCalledWith(1, "cake");
    expect(onChange).toHaveBeenNthCalledWith(2, "coffee");
    // Left from Coffee wraps past disabled Both to Cake.
    fireEvent.keyDown(coffee, { key: "ArrowLeft" });
    expect(cake).toHaveFocus();
    fireEvent.keyDown(cake, { key: "ArrowUp" });
    expect(coffee).toHaveFocus();
    expect(screen.getByRole("radio", { name: /Both/ })).toBeDisabled();
  });

  it("[PD-05] uncontrolled with a name: the hidden input carries the value in the form", () => {
    render(
      <form data-testid="f">
        <LiquidChoice
          label="Visit type"
          name="visit"
          defaultValue="in"
          options={[
            { value: "in", label: "In shop" },
            { value: "away", label: "Takeaway" },
          ]}
        />
      </form>,
    );
    const form = screen.getByTestId<HTMLFormElement>("f");
    expect(new FormData(form).get("visit")).toBe("in");
    fireEvent.click(screen.getByRole("radio", { name: "Takeaway" }));
    expect(new FormData(form).get("visit")).toBe("away");
  });

  it("[PD-05] nothing chosen: no radio checked, no gold, the first enabled option takes the tab stop", () => {
    render(
      <LiquidChoice
        label="Size"
        options={[
          { value: "s", label: "Small", disabled: true },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" },
        ]}
      />,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("data-empty");
    fireEvent.keyDown(radios[1] as HTMLElement, { key: "ArrowRight" });
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radiogroup")).not.toHaveAttribute("data-empty");
  });

  it("[PD-05] 2 to 5 options: one column each", () => {
    for (const n of [2, 3, 4, 5]) {
      const { unmount } = render(
        <LiquidChoice
          label={`n${String(n)}`}
          defaultValue="0"
          options={Array.from({ length: n }, (_, i) => ({ value: String(i), label: String(i) }))}
        />,
      );
      const group = screen.getByRole("radiogroup");
      expect(group.style.getPropertyValue("--n")).toBe(String(n));
      expect(screen.getAllByRole("radio")).toHaveLength(n);
      unmount();
    }
  });

  it("[PD-05] SegmentedControl keeps its API on the liquid choice", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Date range"
        value="30"
        onChange={onChange}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Date range" })).toHaveClass("m-liquid");
    fireEvent.click(screen.getByRole("radio", { name: "7 days" }));
    expect(onChange).toHaveBeenCalledWith("7");
  });

  it("[PD-05] RadioGroup cards: named by its visible label, hint linked, value submitted under its name", () => {
    render(
      <form data-testid="f">
        <RadioGroup
          variant="cards"
          label="Plan"
          name="plan"
          defaultValue="monthly"
          hint="Billed in GBP."
          options={[
            { value: "monthly", label: "Monthly", description: "£9" },
            { value: "yearly", label: "Yearly", description: "£90" },
          ]}
        />
      </form>,
    );
    const group = screen.getByRole("radiogroup", { name: "Plan" });
    expect(group).toHaveAccessibleDescription("Billed in GBP.");
    expect(screen.getByRole("radio", { name: "Monthly £9" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("radio", { name: /Yearly/ }));
    expect(new FormData(screen.getByTestId<HTMLFormElement>("f")).get("plan")).toBe("yearly");
  });

  it("[PD-05] RadioGroup cards with an error: invalid, the error described, disabled skips everything", () => {
    const { rerender } = render(
      <RadioGroup
        variant="cards"
        label="Plan"
        name="plan"
        error="Choose a plan."
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ]}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Plan" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Choose a plan.");
    rerender(
      <RadioGroup
        variant="cards"
        label="Plan"
        name="plan"
        disabled
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ]}
      />,
    );
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("[PD-05] Seal checkbox", () => {
  it("[PD-05] a native checkbox named by its label, described by its description, with the seal box and tick", () => {
    render(<Checkbox label="Monthly recap of my gold" description="On the 1st" name="recap" />);
    const box = screen.getByRole("checkbox", { name: "Monthly recap of my gold" });
    expect(box).toHaveAttribute("type", "checkbox");
    expect(box).toHaveAccessibleDescription("On the 1st");
    const seal = box.nextElementSibling;
    expect(seal).toHaveClass("m-box");
    expect(seal?.querySelector("svg path")).toHaveAttribute("d", "M5 12.5l4.2 4.2L19 7");
  });

  it("[PD-05] form values unchanged: submitted under its name only when ticked", () => {
    render(
      <form data-testid="f">
        <Checkbox label="Email me new offers" name="offers" value="yes" />
      </form>,
    );
    const form = screen.getByTestId<HTMLFormElement>("f");
    expect(new FormData(form).get("offers")).toBeNull();
    fireEvent.click(screen.getByText("Email me new offers"));
    expect(new FormData(form).get("offers")).toBe("yes");
  });

  it("[PD-05] ticking throws the ring and 10 sparks at 120 ms; unticking neither", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    function Accepting() {
      const [on, setOn] = useState(false);
      return (
        <Checkbox
          label="Remind me"
          checked={on}
          onCheckedChange={(next) => {
            setOn(next);
            onChange(next);
          }}
        />
      );
    }
    render(<Accepting />);
    const input = screen.getByRole("checkbox");
    const seal = input.nextElementSibling;
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(seal).toHaveClass("burst");
    act(() => {
      vi.advanceTimersByTime(SEAL.sparkAtMs);
    });
    expect(fx.burst).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.objectContaining({ type: "spark", count: 10, speed: [90, 240], life: [0.35, 0.6] }),
    );
  });

  it("[PD-05] unticking: no sparks; reduced motion: no ring, no sparks", () => {
    vi.useFakeTimers();
    const { unmount } = render(<Checkbox label="A" defaultChecked />);
    fireEvent.click(screen.getByRole("checkbox"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(fx.burst).not.toHaveBeenCalled();
    unmount();
    document.documentElement.classList.add("rm");
    render(<Checkbox label="B" />);
    fireEvent.click(screen.getByRole("checkbox"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox").nextElementSibling).not.toHaveClass("burst");
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-11] the seal follows the value: a parent that refuses the tick gets no pop, ring or sparks", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Checkbox label="Remind me" checked={false} onCheckedChange={onChange} />);
    const input = screen.getByRole("checkbox");
    fireEvent.click(input);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).toHaveBeenCalledWith(true);
    expect(input).not.toBeChecked();
    expect(input.nextElementSibling).not.toHaveClass("burst");
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-11] a tick the user didn't make (a template filling the form) seals quietly", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Checkbox label="Mystery" checked={false} />);
    rerender(<Checkbox label="Mystery" checked />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox").nextElementSibling).not.toHaveClass("burst");
    expect(fx.burst).not.toHaveBeenCalled();
  });

  it("[PD-05] an error marks it invalid and is described", () => {
    render(<Checkbox label="Accept the terms" error="Tick to continue." />);
    const box = screen.getByRole("checkbox", { name: "Accept the terms" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Tick to continue.");
  });
});

describe("[PD-05] review fixes (design review 22 Nov)", () => {
  it("[PD-05] the hydration lock (C-20) never dims: only a real disabled option or box carries data-disabled", () => {
    // Server render = before hydration: controlled controls are locked (disabled) but must not look disabled.
    const html = renderToString(
      <>
        <LiquidChoice
          label="Pick"
          value="a"
          onChange={() => undefined}
          options={[
            { value: "a", label: "A" },
            { value: "b", label: "B", disabled: true },
          ]}
        />
        <Checkbox label="Locked" checked={false} onCheckedChange={() => undefined} />
        <Checkbox label="Off" disabled />
      </>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const opts = [...doc.querySelectorAll(".m-opt")];
    expect(opts.map((o) => o.hasAttribute("disabled"))).toEqual([true, true]);
    expect(opts.map((o) => o.hasAttribute("data-disabled"))).toEqual([false, true]);
    const rows = [...doc.querySelectorAll(".m-chk")];
    expect(rows.map((r) => r.querySelector("input")?.hasAttribute("disabled"))).toEqual([
      true,
      true,
    ]);
    expect(rows.map((r) => r.hasAttribute("data-disabled"))).toEqual([false, true]);
  });

  it("[PD-05] a chosen option that is disabled keeps the group reachable: the tab stop is the first enabled option", () => {
    render(
      <LiquidChoice
        label="Pick"
        defaultValue="b"
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
          { value: "c", label: "C" },
        ]}
      />,
    );
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("aria-checked", "true");
  });

  it("[PD-05] SegmentedControl is a quiet filter: choosing throws no sparks", () => {
    vi.useFakeTimers();
    function Range(): React.JSX.Element {
      const [v, setV] = useState("7");
      return (
        <SegmentedControl
          label="Range"
          value={v}
          onChange={setV}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
          ]}
        />
      );
    }
    render(<Range />);
    fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
    act(() => {
      vi.advanceTimersByTime(LIQUID.sparkAtMs + 50);
    });
    expect(fx.burst).not.toHaveBeenCalled();
  });
});
