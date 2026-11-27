import { describe, expect, it } from "vitest";
import { longestWord } from "./longest-word";

describe("[P1-09] longest word (title size)", () => {
  it("counts the letters of the longest word (accents as one), at least 1", () => {
    expect(longestWord("The Extraordinarily Long-Named Neighbourhood Coffee House Ltd")).toBe(15);
    expect(longestWord("Brew & Bloom Café")).toBe(5);
    expect(longestWord("  ")).toBe(1);
  });
});
