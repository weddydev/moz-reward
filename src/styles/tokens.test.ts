import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { colourTokens } from "./tokens";

const css = readFileSync(path.join(__dirname, "tokens.css"), "utf8");

describe("[P0-01] TS colour tokens mirror tokens.css", () => {
  it.each(Object.entries(colourTokens))("--%s matches", (name, value) => {
    const declared = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(css)?.[1];
    expect(declared?.toLowerCase()).toBe(value);
  });
});
