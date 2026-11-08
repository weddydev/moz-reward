// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the product name and tagline", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Moz Rewards" })).toBeInTheDocument();
    expect(screen.getByText("Collect gold with every visit.")).toBeInTheDocument();
  });
});
