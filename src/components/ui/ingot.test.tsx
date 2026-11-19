// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { INGOT_BOX, levelY } from "@/lib/loyalty/ingot";
import { Ingot } from "./Ingot";

const part = (c: HTMLElement, name: string): Element | null =>
  c.querySelector(`[data-ingot-part="${name}"]`);

describe("[P1-08] Ingot", () => {
  it("0%: an empty mould, no liquid and no wave", () => {
    const { container } = render(<Ingot gold={0} size={1_000} />);
    expect(screen.getByRole("img", { name: "0 of 1,000 gold, 0%" })).toBeInTheDocument();
    expect(part(container, "fill")).toBeNull();
    expect(part(container, "wave")).toBeNull();
  });

  it("50%: liquid at half height with a wave on its surface", () => {
    const { container } = render(<Ingot gold={500} size={1_000} />);
    expect(screen.getByRole("img", { name: "500 of 1,000 gold, 50%" })).toBeInTheDocument();
    expect(part(container, "fill")?.getAttribute("transform")).toBe(
      `translate(0 ${String(levelY(0.5))})`,
    );
    expect(part(container, "wave")).not.toBeNull();
  });

  it("99%: nearly full and still reads 99%", () => {
    const { container } = render(<Ingot gold={999} size={1_000} />);
    expect(screen.getByRole("img", { name: "999 of 1,000 gold, 99%" })).toBeInTheDocument();
    expect(part(container, "wave")).not.toBeNull();
  });

  it("100%: full to the top, flat (no wave)", () => {
    const { container } = render(<Ingot gold={1_000} size={1_000} />);
    expect(screen.getByRole("img", { name: "1,000 of 1,000 gold, 100%" })).toBeInTheDocument();
    expect(part(container, "fill")?.getAttribute("transform")).toBe(
      `translate(0 ${String(INGOT_BOX.top)})`,
    );
    expect(part(container, "wave")).toBeNull();
  });

  it("overflow: a full ingot that never claims more than 100%", () => {
    render(<Ingot gold={2_400} size={1_000} />);
    expect(screen.getByRole("img", { name: "1,000 of 1,000 gold, 100%" })).toBeInTheDocument();
  });

  it("decorative: hidden from assistive tech", () => {
    const { container } = render(<Ingot gold={720} size={1_000} decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("draws milestone ticks beside the mould", () => {
    const { container } = render(<Ingot gold={300} size={1_000} marks={[25, 50, 75]} />);
    expect(container.querySelectorAll("[data-ingot-mark]")).toHaveLength(3);
  });

  it("static mode has no pour parts; animated mode hides them at rest", () => {
    const { container: still } = render(<Ingot gold={720} size={1_000} />);
    expect(part(still, "stream")).toBeNull();
    expect(part(still, "glint")).toBeNull();
    const { container: moving } = render(<Ingot gold={720} size={1_000} animated />);
    expect(part(moving, "stream")).toHaveAttribute("opacity", "0");
    expect(part(moving, "glint")).toHaveAttribute("opacity", "0");
  });

  it("stays within the 6 KB SVG budget (DESIGN §8.3), animated, with marks", () => {
    const html = renderToStaticMarkup(
      <Ingot gold={720} size={1_000} marks={[25, 50, 75]} animated />,
    );
    expect(new TextEncoder().encode(html).length).toBeLessThanOrEqual(6 * 1024);
  });

  it("gives every instance its own gradient and clip ids", () => {
    const { container } = render(
      <>
        <Ingot gold={100} size={1_000} />
        <Ingot gold={200} size={1_000} />
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
