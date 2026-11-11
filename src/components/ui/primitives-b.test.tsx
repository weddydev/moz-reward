// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bell, MapPin } from "lucide-react";
import { useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Avatar, initialsOf } from "./Avatar";
import { Checkbox } from "./Checkbox";
import { ErrorState } from "./ErrorState";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { MilestoneTrack } from "./MilestoneTrack";
import { RadioGroup } from "./Radio";
import { Select } from "./Select";

describe("[P0-09] Icon", () => {
  it("is decorative by default, with the 1.5px stroke", () => {
    const { container } = render(<Icon icon={MapPin} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("stroke-width", "1.5");
  });
  it("is an image with a name when labelled", () => {
    render(<Icon icon={Bell} label="Notifications on" />);
    expect(screen.getByRole("img", { name: "Notifications on" })).toBeInTheDocument();
  });
});

describe("[P0-09] IconButton", () => {
  it("is named by its label and runs once per click", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={Bell} label="Notifications" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("does not run while disabled", async () => {
    const onClick = vi.fn();
    render(<IconButton icon={Bell} label="Notifications" onClick={onClick} disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("[P0-09] Select", () => {
  it("links label, error and the caller's description; marks invalid", () => {
    render(
      <>
        <p id="why">Used for opening hours.</p>
        <Select
          label="Shop type"
          error="Choose a shop type."
          aria-describedby="why"
          options={[
            { value: "cafe", label: "Café" },
            { value: "barber", label: "Barber — beard trims, hot towel shaves and more" },
          ]}
        />
      </>,
    );
    const select = screen.getByLabelText("Shop type");
    expect(select).toHaveAccessibleDescription("Choose a shop type. Used for opening hours.");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });
  it("shows a placeholder option that can't be chosen again", () => {
    render(
      <Select
        label="Shop type"
        placeholder="Choose…"
        defaultValue=""
        options={[{ value: "cafe", label: "Café" }]}
      />,
    );
    expect(screen.getByRole("option", { name: "Choose…" })).toBeDisabled();
    expect(screen.getByLabelText("Shop type")).toHaveValue("");
  });
});

describe("[P0-09] Checkbox", () => {
  it("toggles from its label (the whole row) and links description and error", async () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return (
        <Checkbox
          label="Email me offers"
          description="About once a week."
          error={on ? undefined : "Tick to continue."}
          checked={on}
          onCheckedChange={setOn}
        />
      );
    }
    render(<Harness />);
    const box = screen.getByRole("checkbox", { name: "Email me offers" });
    expect(box).toHaveAccessibleDescription("About once a week. Tick to continue.");
    expect(box).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(screen.getByText("About once a week."));
    expect(box).toBeChecked();
    expect(box).not.toHaveAttribute("aria-invalid");
  });
  it("does not toggle while disabled", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Sounds" checked={false} onCheckedChange={onChange} disabled />);
    await userEvent.click(screen.getByText("Sounds"));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("works uncontrolled inside a form (no JS state needed)", async () => {
    render(
      <form aria-label="f">
        <Checkbox label="Remember me" name="remember" />
      </form>,
    );
    await userEvent.click(screen.getByText("Remember me"));
    const data = new FormData(screen.getByRole<HTMLFormElement>("form", { name: "f" }));
    expect(data.get("remember")).toBe("on");
  });
});

describe("[P0-09] RadioGroup", () => {
  const OPTIONS = [
    { value: "visits", label: "Per visit", description: "One stamp each time." },
    { value: "spend", label: "Per £1 spent" },
  ];
  it("is a named group; picking by label calls back with the value", async () => {
    const onChange = vi.fn();
    render(
      <RadioGroup
        label="Earn rule"
        name="rule"
        options={OPTIONS}
        value="visits"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Earn rule" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Per visit" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Per visit" })).toHaveAccessibleDescription(
      "One stamp each time.",
    );
    await userEvent.click(screen.getByText("Per £1 spent"));
    expect(onChange).toHaveBeenCalledWith("spend");
  });
  it("links the error and the caller's description to the group and marks it invalid", () => {
    render(
      <>
        <p id="note">You can change this later.</p>
        <RadioGroup
          label="Earn rule"
          name="rule"
          options={OPTIONS}
          error="Choose an earn rule."
          aria-describedby="note"
        />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Earn rule" });
    expect(group).toHaveAccessibleDescription("Choose an earn rule. You can change this later.");
    expect(group).toHaveAttribute("aria-invalid", "true");
  });
  it("disables every option when the group is disabled", () => {
    render(<RadioGroup label="Earn rule" name="rule" options={OPTIONS} disabled />);
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("[P0-09] Avatar", () => {
  it.each([
    ["Aisha Khan", "AK"],
    ["aisha", "A"],
    ["  Mary  Jane   Watson ", "MW"],
    ["Ólafur Arnalds", "ÓA"],
    ["", ""],
  ])("initials of %j are %j", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
  it("falls back to initials when the image fails to load", () => {
    const { container } = render(<Avatar name="Aisha Khan" src="/broken.jpg" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AK")).toBeInTheDocument();
  });
  it("shows a generic icon when there is no name and no image", () => {
    const { container } = render(<Avatar />);
    expect(container.querySelector("svg")).not.toBeNull();
  });
  it("is named when it stands alone, decorative otherwise", () => {
    render(
      <>
        <Avatar name="Aisha Khan" labelled />
        <Avatar name="Tom Fletcher" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Aisha Khan" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Tom Fletcher" })).not.toBeInTheDocument();
  });
});

describe("[P0-09] MilestoneTrack", () => {
  const steps = (reached: number, n = 4) =>
    Array.from({ length: n }, (_, i) => ({
      label: `Reward ${String(i + 1)}`,
      reached: i < reached,
    }));

  it("renders nothing for no milestones", () => {
    const { container } = render(<MilestoneTrack label="Rewards" steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("states each milestone's status in text and marks the next one current", () => {
    render(<MilestoneTrack label="Rewards" steps={steps(2)} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Reward 1, reached");
    expect(items[2]).toHaveTextContent("Reward 3, next");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[3]).toHaveTextContent("Reward 4, not reached yet");
  });
  it.each([
    ["none reached", 0, 0],
    ["all reached", 4, -1],
    ["a single milestone", 0, 0, 1],
  ])("%s", (_name, reached, current, n = 4) => {
    render(<MilestoneTrack label="Rewards" steps={steps(reached, n)} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(n);
    items.forEach((li, i) => {
      if (i === current) expect(li).toHaveAttribute("aria-current", "step");
      else expect(li).not.toHaveAttribute("aria-current");
    });
  });
});

describe("[P0-09] ErrorState", () => {
  it("is announced and retries once per press", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="We couldn't load your rewards." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your rewards.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("keeps the retry button but swallows presses while retrying", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Offline." onRetry={onRetry} retrying />);
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onRetry).not.toHaveBeenCalled();
  });
  it("server HTML has the retry button disabled until hydration (C-20)", () => {
    const html = renderToString(<ErrorState message="Offline." onRetry={() => undefined} />);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
  it("has no button without a retry action", () => {
    render(<ErrorState message="This page has moved." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
