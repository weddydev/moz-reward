import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colourTokens } from "./tokens";

const css = readFileSync(path.join(__dirname, "tokens.css"), "utf8");
/** First hex declaration of each token (later ones are theme overrides). */
const declared = new Map<string, string>();
for (const [, name = "", hex = ""] of css.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g))
  if (!declared.has(name)) declared.set(name, hex);

describe("[P0-01] TS colour tokens mirror tokens.css", () => {
  it.each(Object.entries(colourTokens))("--%s matches", (name, value) => {
    expect(declared.get(name)?.toLowerCase()).toBe(value);
  });
});
