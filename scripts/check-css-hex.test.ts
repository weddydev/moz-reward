import { describe, expect, it } from "vitest";
import { hexLines } from "./check-css-hex";

describe("[P0-01] CSS hex colour check", () => {
  it("finds hex colours in declarations", () => {
    expect(
      hexLines(".a {\n  color: #fff;\n  background: linear-gradient(red, #1C1A17AA);\n}"),
    ).toEqual([2, 3]);
  });

  it("ignores tokens, comments, ids and entities", () => {
    expect(
      hexLines(
        ".a { color: var(--ink); }\n/* was #faf5ea */\n#main { top: 0 }\n.b::after { content: '&#123;' }",
      ),
    ).toEqual([]);
  });
});
