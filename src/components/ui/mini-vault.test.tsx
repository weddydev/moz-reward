// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniVault } from "./MiniVault";

describe("[PD-08] mini vault (reference .mini-vault)", () => {
  it("[PD-08] shows the gold towards the reward and a named bar scaled to the share", () => {
    const { container } = render(<MiniVault gold={720} target={1000} />);
    expect(screen.getByText("720 / 1,000")).toBeVisible();
    const bar = screen.getByRole("progressbar", { name: "Gold Vault: 720 / 1,000 gold" });
    expect(bar).toHaveAttribute("aria-valuenow", "720");
    expect(container.querySelector("[data-wipe-bar]")).toHaveStyle({ transform: "scaleX(0.72)" });
  });

  it("[PD-08] over the target the bar is full; a zero target shows an empty bar", () => {
    const { container, rerender } = render(<MiniVault gold={1400} target={1000} />);
    expect(container.querySelector("[data-wipe-bar]")).toHaveStyle({ transform: "scaleX(1)" });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1000");
    rerender(<MiniVault gold={10} target={0} />);
    expect(container.querySelector("[data-wipe-bar]")).toHaveStyle({ transform: "scaleX(0)" });
  });
});
