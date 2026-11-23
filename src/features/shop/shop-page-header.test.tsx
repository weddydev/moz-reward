// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShopPageHeader } from "./ShopPageHeader";

describe("[PD-08] shop page cover", () => {
  it("[PD-08] the page's cover: photo under the shade, name as the h1 with its area line, logo in the corner, back to the Wallet", () => {
    const { container } = render(
      <ShopPageHeader
        name="Brew & Bloom Café"
        logoUrl="/demo/shops/brew-logo.jpg"
        coverUrl="/demo/shops/brew-cover.jpg"
        meta="Café · Camden"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Brew & Bloom Café" })).toBeVisible();
    expect(screen.getByText("Café · Camden")).toHaveClass("m-cover-meta");
    const back = screen.getByRole("link", { name: "Back to wallet" });
    expect(back).toHaveAttribute("href", "/wallet");
    // Both photos are decorative: the name beside them says whose they are.
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) expect(img).toHaveAttribute("alt", "");
    expect(container.querySelector(".m-cover-photo")?.tagName).toBe("IMG");
    expect(container.querySelector(".m-cover-logo img")).not.toBeNull();
    expect(screen.getByTestId("shop-cover")).toHaveClass("m-cover");
    // The page's cover marks nothing for the wipe's rise.
    expect(container.querySelector("[data-rise]")).toBeNull();
  });

  it("[PD-08] /dev/molten phone: back is a button calling onBack (no link), the logo, name and area line rise 0/1/2, the name can be an h3", () => {
    const onBack = vi.fn();
    const { container } = render(
      <ShopPageHeader
        name="Brew & Bloom Café"
        logoUrl="/demo/shops/brew-logo.jpg"
        coverUrl="/demo/shops/brew-cover.jpg"
        meta="Camden High St · open till 8pm"
        onBack={onBack}
        rise
        titleAs="h3"
        unoptimized
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to wallet" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const title = screen.getByRole("heading", { level: 3, name: "Brew & Bloom Café" });
    const rises = [...container.querySelectorAll<HTMLElement>("[data-rise]")].map((el) => [
      el.className,
      el.dataset.rise,
    ]);
    expect(rises).toEqual(
      expect.arrayContaining([
        ["m-cover-logo", "0"],
        ["m-cover-title", "1"],
        ["m-cover-meta", "2"],
      ]),
    );
    expect(rises).toHaveLength(3);
    expect(title).toHaveAttribute("data-rise", "1");
    // Served as they are (compared with the reference's own JPEGs), not through the optimiser.
    for (const img of container.querySelectorAll("img"))
      expect(img.getAttribute("src")).toMatch(/^\/demo\/shops\/brew-(cover|logo)\.jpg$/);
  });

  it("[PD-08] no photos: the metal ground under the shade and the monogram coin, never bare initials on a flat fill", () => {
    const { container } = render(
      <ShopPageHeader name="Pedal & Co." logoUrl={null} coverUrl={null} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("span.m-cover-photo")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("shop-coin")).toHaveTextContent("PC");
    expect(container.querySelector(".m-cover-meta")).toBeNull();
  });

  it("[PD-08] loading (from a tapped card): the same cover with the card's logo and name, hidden from the a11y tree; the photo shimmers; back still works", () => {
    const { container } = render(
      <ShopPageHeader
        name="Brew & Bloom Café"
        logoUrl="/demo/shops/brew-logo.jpg"
        coverUrl="/demo/shops/brew-cover.jpg"
        loading
      />,
    );
    expect(screen.queryByRole("heading")).toBeNull();
    const name = screen.getByTestId("member-shop-name-loading");
    expect(name.tagName).toBe("P");
    expect(name.closest("[aria-hidden='true']")).not.toBeNull();
    // No cover photo yet (the page brings it); the logo is the card's, already loaded.
    expect(container.querySelector("img.m-cover-photo")).toBeNull();
    expect(container.querySelector(".m-cover-photo")).toHaveClass("skeleton");
    expect(container.querySelector(".m-cover-logo img")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Back to wallet" })).toHaveAttribute("href", "/wallet");
    expect(screen.queryByTestId("shop-cover")).toBeNull();
  });
});
