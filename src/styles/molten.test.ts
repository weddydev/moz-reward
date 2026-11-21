import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/molten.css", "utf8");

/** The declarations of `selector` inside the fine-pointer hover block (the only place card lifts live). */
function hoverRule(selector: string): string | null {
  const block =
    /@media \(hover: hover\) and \(pointer: fine\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  // Plain string search (a rule starts on its own line), so no pattern is built from the argument.
  const start = block.split("\n").findIndex((line) => line.trim() === `${selector} {`);
  if (start < 0) return null;
  const rest = block.split("\n").slice(start + 1);
  return rest
    .slice(
      0,
      rest.findIndex((line) => line.trim() === "}"),
    )
    .join("\n");
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
