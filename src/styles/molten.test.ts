import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/molten.css", "utf8");

/** The declarations of `selector` inside the fine-pointer hover block (the only place card lifts live). */
function hoverRule(selector: string): string | null {
  const block =
    /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)\\s*${escaped} \\{([^}]*)\\}`).exec(block)?.[1] ?? null;
}

describe("[PD-02] Molten card lift (DESIGN §6.1; reference `.pcard:hover`, `.spec:hover`)", () => {
  it("[PD-02] a placed or dark card with data-lift rises 4px on a fine-pointer hover", () => {
    expect(hoverRule(".m-placed[data-lift]:hover")).toContain("translate: 0 -4px");
    // PD-A design review M4: the reference's dark price card lifts like the light ones.
    expect(hoverRule(".m-dark[data-lift]:hover")).toContain("translate: 0 -4px");
  });

  it("[PD-02] a dark card without data-lift only deepens its shadow (the reference spec card stays put)", () => {
    const plain = hoverRule(".m-dark:hover");
    expect(plain).toContain("box-shadow: var(--lift-dark), var(--lift-hover)");
    expect(plain).not.toContain("translate");
  });
});
