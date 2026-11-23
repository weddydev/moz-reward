// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WalletStack } from "@/features/wallet/WalletStack";
import { ShopCard } from "./ShopCard";
import { OPTIMISED_PHOTO } from "./ShopImage";

function Card(props: Partial<React.ComponentProps<typeof ShopCard>> & { name: string }) {
  return (
    <ShopCard
      logoUrl={null}
      coverUrl={null}
      progress={0.72}
      progressLabel="72% · 1 more visit"
      {...props}
      render={({ className, children, ...data }) => (
        <a href="#shop" className={className} {...data} aria-label={props.name}>
          {children}
        </a>
      )}
    />
  );
}

describe("[PD-08] wallet card (DESIGN §6.4)", () => {
  it("[PD-08] a demo shop's cover and logo go through the image optimiser, decorative; gold count and progress", () => {
    const { container } = render(
      <Card
        name="Brew & Bloom Café"
        address="12 Lockside Walk, Camden"
        logoUrl="/demo/shops/brew-logo.jpg"
        coverUrl="/demo/shops/brew-cover.jpg"
        gold="720"
      />,
    );
    const card = screen.getByRole("link", { name: "Brew & Bloom Café" });
    expect(card).toHaveClass("m-wcard");
    const imgs = [...container.querySelectorAll("img")];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("src")).toMatch(/^\/_next\/image\?url=%2Fdemo%2Fshops%2F/);
    }
    // The logo has its box; the cover fills the fixed-height card (no layout shift either way).
    const logo = imgs.find((i) => i.getAttribute("width") === "36");
    expect(logo?.getAttribute("height")).toBe("36");
    expect(within(card).getByText("720")).toHaveClass("m-wc-gold");
    expect(within(card).getByText("12 Lockside Walk, Camden")).toHaveClass("m-wc-addr");
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "72");
    expect(card.querySelector(".m-wc-bar > i")?.getAttribute("style")).toContain("--p: 72%");
  });

  it("[PD-08] no photos: the metal monogram coin and the obsidian ground, never bare initials on a flat fill", () => {
    const { container } = render(<Card name="Patel's Corner Store" />);
    const coin = screen.getByTestId("shop-coin");
    expect(coin).toHaveClass("m-coin");
    expect(coin).toHaveAttribute("aria-hidden", "true");
    expect(coin).toHaveTextContent("PS");
    expect(container.querySelector(".m-photo-fallback")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("[PD-08] uploaded photos (CDN) load as they are; only self-hosted demo photos match the optimiser's pattern", () => {
    const { container } = render(
      <Card name="Real shop" coverUrl="https://cdn.example.test/c/1.avif" logoUrl={null} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.test/c/1.avif",
    );
    expect(OPTIMISED_PHOTO.test("/demo/shops/brew-cover.jpg")).toBe(true);
    for (const bad of ["/demo/shops/../secret.jpg", "/demo/shops/a.jpg?x=1", "/uploads/a.jpg"])
      expect(OPTIMISED_PHOTO.test(bad), bad).toBe(false);
  });

  it("[PD-08] a suspended shop is dimmed and its badge says why; a 100% card clamps its bar", () => {
    render(
      <Card name="Paused" dimmed progress={1.4} badges={<span>Taking a break</span>} gold={null} />,
    );
    const card = screen.getByRole("link", { name: "Paused" });
    expect(card).toHaveAttribute("data-dimmed", "");
    expect(within(card).getByText("Taking a break")).toBeVisible();
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(card.querySelector(".m-wc-gold")).toBeNull();
  });
});

describe("[PD-08] wallet stack", () => {
  const cards = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      key: `m${String(i)}`,
      card: <Card name={`Shop ${String(i)}`} />,
    }));

  it("[PD-08] one shop: a single card in a single stack, no Show all", () => {
    const { container } = render(<WalletStack cards={cards(1)} />);
    expect(container.querySelectorAll(".m-stack")).toHaveLength(1);
    expect(container.querySelectorAll(".m-wslot")).toHaveLength(1);
    expect(screen.queryByTestId("wallet-show-all")).toBeNull();
  });

  it("[PD-08] five shops: stacks of three and two; the second opens with Show all (phones) and closes again", () => {
    const { container } = render(<WalletStack cards={cards(5)} />);
    const stacks = [...container.querySelectorAll<HTMLElement>(".m-stack")];
    expect(stacks.map((s) => s.querySelectorAll(".m-wslot").length)).toEqual([3, 2]);
    // Each card's place in its stack staggers the shine and sets the fan-out offset.
    expect(
      [...container.querySelectorAll<HTMLElement>(".m-wslot")].map((s) =>
        s.style.getPropertyValue("--i"),
      ),
    ).toEqual(["0", "1", "2", "0", "1"]);
    expect(stacks[0]).not.toHaveClass("max-md:hidden");
    expect(stacks[1]).toHaveClass("max-md:hidden");
    const more = screen.getByTestId("wallet-show-all");
    expect(more).toHaveTextContent("Show all 5 shops");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAttribute("aria-controls", "wallet-stacks");
    fireEvent.click(more);
    expect(stacks[1]).not.toHaveClass("max-md:hidden");
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(more).toHaveTextContent("Show fewer");
    fireEvent.click(more);
    expect(stacks[1]).toHaveClass("max-md:hidden");
  });

  it("[PD-08] thirty shops: ten stacks of three, all in the DOM (the grid shows them from 768px)", () => {
    const { container } = render(<WalletStack cards={cards(30)} />);
    expect(container.querySelectorAll(".m-stack")).toHaveLength(10);
    expect(container.querySelectorAll(".m-wcard")).toHaveLength(30);
    expect(container.querySelectorAll(".m-stack.max-md\\:hidden")).toHaveLength(9);
  });
});
