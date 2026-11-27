// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoverPhoto } from "./CoverPhoto";
import { ShopImage } from "./ShopImage";
import type { ComponentProps } from "react";

/** The photo as a caller passes it: a `ShopImage` child (C-91: rendered where the caller is). */
function Cover(props: ComponentProps<typeof ShopImage>): React.JSX.Element {
  return (
    <CoverPhoto src={props.src}>
      <ShopImage {...props} />
    </CoverPhoto>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("[PD-11] CoverPhoto: a cover that can't load gives way to the ground (FOLLOWUPS, PD-A QA)", () => {
  it("[PD-11] shows the photo, and removes it when it fails to load", () => {
    render(<Cover src="https://cdn.example/cover.webp" testId="cover" eager />);
    const img = screen.getByTestId("cover");
    expect(img.tagName).toBe("IMG");
    act(() => {
      fireEvent.error(img);
    });
    expect(screen.queryByTestId("cover")).toBeNull();
  });

  it("[PD-11] a photo that failed before hydration (complete, no pixels) is removed at mount", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    render(<Cover src="https://cdn.example/missing.webp" testId="cover" eager />);
    expect(screen.queryByTestId("cover")).toBeNull();
  });

  it("[PD-11] a loaded photo stays; a new src gets its own chance", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1200);
    const { rerender } = render(<Cover src="https://cdn.example/a.webp" testId="cover" />);
    expect(screen.getByTestId("cover")).toBeTruthy();
    act(() => {
      fireEvent.error(screen.getByTestId("cover"));
    });
    expect(screen.queryByTestId("cover")).toBeNull();
    width.mockReturnValue(0);
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);
    rerender(<Cover src="https://cdn.example/b.webp" testId="cover" />);
    expect(screen.getByTestId("cover").getAttribute("src")).toBe("https://cdn.example/b.webp");
  });
});
