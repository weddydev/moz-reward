// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { ProgressBar } from "./ProgressBar";
import { SegmentedControl } from "./SegmentedControl";
import { sparklinePath } from "./Sparkline";
import { Switch } from "./Switch";
import { Tabs } from "./Tabs";
import { TextArea, TextField } from "./TextField";

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
  it("merges a caller's aria-describedby with its own instead of dropping either", () => {
    render(
      <>
        <p id="limit">Up to £500.</p>
        <TextField label="Amount" error="Enter an amount." aria-describedby="limit" />
        <TextArea label="Note" hint="Optional." aria-describedby="limit" />
      </>,
    );
    expect(screen.getByLabelText("Amount")).toHaveAccessibleDescription(
      "Enter an amount. Up to £500.",
    );
    expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Note")).toHaveAccessibleDescription("Optional. Up to £500.");
  });
  it("keeps the invalid state when the caller passes other input props", () => {
    render(<TextField label="Postcode" error="Too short." aria-invalid={false} required />);
    expect(screen.getByLabelText(/Postcode/)).toHaveAttribute("aria-invalid", "true");
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

  it("toggles when its label is clicked and links the description", async () => {
    const onChange = vi.fn();
    render(
      <Switch
        label="Birthday treat reminders"
        description="One email a year."
        checked
        onCheckedChange={onChange}
      />,
    );
    await userEvent.click(screen.getByText("Birthday treat reminders"));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch")).toHaveAccessibleDescription("One email a year.");
  });

  it("does not toggle while disabled", async () => {
    const onChange = vi.fn();
    render(<Switch label="Sounds" checked={false} onCheckedChange={onChange} disabled />);
    await userEvent.click(screen.getByRole("switch", { name: "Sounds" }));
    await userEvent.click(screen.getByText("Sounds"));
    expect(onChange).not.toHaveBeenCalled();
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
  it.each([
    ["a negative value", -0.3],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("treats %s as empty", (_name, value) => {
    render(<ProgressBar value={value} label="Vault" />);
    expect(screen.getByRole("progressbar", { name: "Vault" })).toHaveAttribute(
      "aria-valuenow",
      "0",
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

describe("[P0-09] Chip", () => {
  it("is a toggle button that reports its pressed state", async () => {
    const onToggle = vi.fn();
    render(
      <Chip selected={false} onToggle={onToggle}>
        Great coffee
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Great coffee" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not toggle while disabled", async () => {
    const onToggle = vi.fn();
    render(
      <Chip selected onToggle={onToggle} disabled>
        Clean
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Clean" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
