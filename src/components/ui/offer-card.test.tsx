// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfferCard } from "./OfferCard";

describe("[PD-08] offer card", () => {
  it("[PD-08] photo on top (decorative), the offer's title in gold over its detail", () => {
    const { container } = render(
      <OfferCard
        imageUrl="/demo/shops/brew-offer1.jpg"
        title="2-for-1 flat white"
        detail="Weekdays before 10am"
      />,
    );
    const card = screen.getByTestId("offer-card");
    expect(card).toHaveClass("m-offer");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(screen.getByText("2-for-1 flat white")).toHaveClass("m-offer-title");
    expect(card).toHaveTextContent("2-for-1 flat whiteWeekdays before 10am");
  });

  it("[PD-08] no photo: the dark ground holds the photo's place, so cards in a row stay the same height", () => {
    const { container } = render(<OfferCard imageUrl={null} title="Free check-up" detail="" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".m-offer-photo")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".m-offer-detail")).toBeNull();
  });
});
