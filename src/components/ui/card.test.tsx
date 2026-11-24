// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { Card } from "./Card";

// jsdom has no layout observers; the gilded edge only needs them to exist (sizes come from the card).
beforeAll(() => {
  class Noop {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // jsdom lacks all three (the types say otherwise), so they are set, not defaulted.
  Object.assign(globalThis, { ResizeObserver: Noop, IntersectionObserver: Noop });
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
});

describe("[PD-02] Card variants (DESIGN §6.1–6.2)", () => {
  it("[PD-11] placed is the default (Molten surface, card radius); dark; the v1 plain card is gone", () => {
    render(
      <>
        <Card data-testid="default">a</Card>
        <Card data-testid="placed" variant="placed" lift>
          b
        </Card>
        <Card data-testid="dark" variant="dark">
          c
        </Card>
        <Card data-testid="own-radius" className="rounded-[20px]">
          d
        </Card>
      </>,
    );
    expect(screen.getByTestId("default").className).toBe("m-placed m-card");
    expect(screen.getByTestId("placed").className).toContain("m-placed");
    expect(screen.getByTestId("placed")).toHaveAttribute("data-lift");
    expect(screen.getByTestId("dark").className).toContain("m-dark");
    expect(screen.getByTestId("dark").className).toContain("m-card");
    expect(screen.getByTestId("dark")).not.toHaveAttribute("data-lift");
    // `.m-card` is a components-layer rule: the caller's own radius utility comes after it and wins.
    expect(screen.getByTestId("own-radius").className).toBe("m-placed m-card rounded-[20px]");
  });

  it("[PD-02] gilded adds one decorative edge as the last child, hidden from assistive tech", () => {
    render(
      <Card data-testid="hero" variant="placed" gilded>
        <p>content</p>
      </Card>,
    );
    const card = screen.getByTestId("hero");
    const edge = card.lastElementChild;
    expect(edge?.tagName.toLowerCase()).toBe("svg");
    expect(edge).toHaveAttribute("aria-hidden", "true");
    expect(edge).toHaveAttribute("focusable", "false");
    expect(card.querySelectorAll("svg.m-seam")).toHaveLength(1);
    // jsdom lays nothing out (0 × 0): nothing is drawn, nothing breaks.
    expect(edge?.querySelectorAll("path")).toHaveLength(0);
  });
});
