// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Section } from "./Section";

describe("[P0-10] dev gallery Section: hydration marker for the E2E guard", () => {
  it("marks itself data-hydrating while its controls wait for hydration", () => {
    render(
      <Section title="Presets" hydrating>
        <button type="button">Play</button>
      </Section>,
    );
    expect(screen.getByRole("region", { name: "Presets" })).toHaveAttribute("data-hydrating", "");
  });

  it("carries no marker once hydrated, or when it has nothing that waits", () => {
    render(
      <>
        <Section title="Stagger" hydrating={false}>
          <p>items</p>
        </Section>
        <Section title="Tokens">
          <p>list</p>
        </Section>
      </>,
    );
    expect(screen.getByRole("region", { name: "Stagger" })).not.toHaveAttribute("data-hydrating");
    expect(screen.getByRole("region", { name: "Tokens" })).not.toHaveAttribute("data-hydrating");
  });
});
