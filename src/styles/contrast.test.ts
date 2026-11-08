import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** WCAG 2.2 contrast checks for every text/background pair the design uses (DESIGN §3, §13). */
const css = readFileSync(join(__dirname, "tokens.css"), "utf8");
const token = (name: string): string => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1]!;
};

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const BODY = 4.5;
const LARGE_OR_UI = 3;

const PAIRS: Array<[fg: string, bg: string, min: number, use: string]> = [
  ["ink", "bg", BODY, "primary text on ivory"],
  ["ink", "surface", BODY, "primary text on cards"],
  ["ink", "surface-2", BODY, "input text"],
  ["ink-2", "bg", BODY, "secondary text on ivory"],
  ["ink-2", "surface", BODY, "secondary text on cards"],
  ["ink-2", "surface-2", BODY, "secondary text on panels"],
  ["ink", "gold-500", BODY, "text on primary (gold) buttons"],
  ["ink", "gold-300", BODY, "text on gold highlight"],
  ["ink", "gold-100", BODY, "text on gold tint"],
  ["gold-700", "bg", LARGE_OR_UI, "gold large text / icons on ivory"],
  ["gold-700", "surface", LARGE_OR_UI, "gold large text / icons on cards"],
  ["ink-3", "bg", LARGE_OR_UI, "placeholders / tertiary (never body)"],
  ["danger", "surface", BODY, "error messages"],
  ["danger", "bg", BODY, "error messages on ivory"],
  ["success", "surface", BODY, "success text"],
  ["warning", "surface", LARGE_OR_UI, "warning icons / large text"],
];

describe("token contrast (WCAG AA)", () => {
  it.each(PAIRS)("%s on %s ≥ %s (%s)", (fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });
});
