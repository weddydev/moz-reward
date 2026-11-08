// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ProgressBar } from "./ProgressBar";
import { SegmentedControl } from "./SegmentedControl";
import { sparklinePath } from "./Sparkline";
import { Switch } from "./Switch";
import { Tabs } from "./Tabs";
import { TextField } from "./TextField";
import { Toaster, __resetToasts, toast } from "./Toast";

describe("[P0-09] Button", () => {
  it("keeps its label for screen readers and swallows clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Approve
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Approve" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).not.toBeDisabled(); // stays focusable
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit a form while loading", async () => {
    const onSubmit = vi.fn((e: React.SyntheticEvent) => {
      e.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Save
        </Button>
      </form>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("[P0-09] TextField", () => {
  it("links the error message with aria-describedby and marks the input invalid", () => {
    render(<TextField label="Postcode" error="Please enter a full UK postcode." />);
    const input = screen.getByLabelText("Postcode");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Please enter a full UK postcode.");
  });
  it("uses the hint as description when there is no error", () => {
    render(<TextField label="UK mobile" hint="Only shared with shops you join." />);
    expect(screen.getByLabelText("UK mobile")).toHaveAccessibleDescription(
      "Only shared with shops you join.",
    );
  });
});

describe("[P0-09] Tabs", () => {
  function Harness() {
    const [v, setV] = useState<"a" | "b" | "c">("a");
    return (
      <Tabs
        label="Requests"
        value={v}
        onChange={setV}
        items={[
          { value: "a", label: "Pending" },
          { value: "b", label: "Approved" },
          { value: "c", label: "Expired" },
        ]}
      >
        <p>panel {v}</p>
      </Tabs>
    );
  }
  it("moves selection with arrow keys, Home and End", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "Pending" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Approved" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Approved" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Expired" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Pending" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("panel a");
  });
});

describe("[P0-09] SegmentedControl", () => {
  it("is a radiogroup with roving focus", async () => {
    function H() {
      const [v, setV] = useState<"7" | "30">("7");
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
    render(<H />);
    const first = screen.getByRole("radio", { name: "7 days" });
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "30 days" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("[P0-09] Switch", () => {
  it("exposes switch semantics and toggles", async () => {
    const onChange = vi.fn();
    render(<Switch label="Sounds" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "Sounds" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("[P0-09] ProgressBar", () => {
  it("clamps and reports a percentage", () => {
    render(<ProgressBar value={1.4} label="Vault" />);
    expect(screen.getByRole("progressbar", { name: "Vault" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});

describe("[P0-09] sparklinePath", () => {
  it("handles empty, single and flat series", () => {
    expect(sparklinePath([], 96, 28)).toBe("");
    expect(sparklinePath([5], 96, 28)).toBe("M2,14L94,14");
    expect(sparklinePath([3, 3, 3], 96, 28).startsWith("M2.0,")).toBe(true);
  });
  it("puts the max at the top and min at the bottom", () => {
    const d = sparklinePath([0, 10], 100, 20, 0);
    expect(d).toBe("M0.0,20.0L100.0,0.0");
  });
});

describe("[P0-09] toast", () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      __resetToasts();
    });
  });

  it("announces politely and auto-dismisses after 4s", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("+80 gold added", "success");
    });
    expect(screen.getByText("+80 gold added")).toBeInTheDocument();
    expect(screen.getByText("+80 gold added").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    act(() => {
      vi.advanceTimersByTime(4000 + 200);
    });
    expect(screen.queryByText("+80 gold added")).not.toBeInTheDocument();
  });

  it("keeps at most three toasts", () => {
    render(<Toaster />);
    act(() => {
      ["a", "b", "c", "d"].forEach((m) => toast(m));
    });
    expect(screen.queryByText("a")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
