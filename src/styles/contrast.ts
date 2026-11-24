/**
 * WCAG 2.2 contrast for every text/background pair the design uses (DESIGN §3, §13). One list, used by the
 * unit test (values parsed from tokens.css) and by the contrast table on /dev/ui (values read from the page).
 */

/** A colour token name, or a mix of two tokens as `color-mix(in srgb, a pct%, b)` computes it. */
export type ColourRef = string | { mix: readonly [token: string, percent: number, base: string] };
export type ContrastPair = { fg: ColourRef; bg: ColourRef; min: number; use: string };

export const BODY = 4.5;
export const LARGE_OR_UI = 3;

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  // Molten (PD-02): pearl page, placed cards (fill from #fffefa to #fffaef; ivory is the darker bound), obsidian
  // panels, swatches. Eyebrows are 12 px, so body contrast.
  { fg: "ink", bg: "pearl", min: BODY, use: "Primary text on the Molten page" },
  { fg: "ink-2", bg: "pearl", min: BODY, use: "Secondary text and ledes on pearl" },
  { fg: "ink-2", bg: "ivory", min: BODY, use: "Secondary text on placed cards (darker bound)" },
  { fg: "gold-deep", bg: "pearl", min: BODY, use: "Eyebrows and gold text on pearl" },
  { fg: "on-obsidian", bg: "obsidian", min: BODY, use: "Text on dark panels" },
  { fg: "on-obsidian-2", bg: "obsidian", min: BODY, use: "Small text on dark panels" },
  { fg: "gold-light", bg: "obsidian", min: BODY, use: "Eyebrows and gold text on obsidian" },
  { fg: "ink", bg: "gold-bright", min: BODY, use: "Text on hot gold" },
  { fg: "ink", bg: "champagne", min: BODY, use: "Text on champagne panels" },
  { fg: "ink", bg: "ember", min: BODY, use: "Text on ember alerts and badges" },
  { fg: "on-obsidian", bg: "gold-deep", min: BODY, use: "Light text on deep gold" },
  { fg: "ink", bg: "pearl", min: BODY, use: "Primary text on the pearl ground" },
  { fg: "ink", bg: "surface", min: BODY, use: "Primary text on cards" },
  { fg: "ink", bg: "surface-2", min: BODY, use: "Input text" },
  { fg: "ink-2", bg: "pearl", min: BODY, use: "Secondary text on the pearl ground" },
  { fg: "ink-2", bg: "surface", min: BODY, use: "Secondary text on cards" },
  { fg: "ink-2", bg: "surface-2", min: BODY, use: "Secondary text on panels" },
  { fg: "ink", bg: "gold", min: BODY, use: "Text on gold (milestone dots, gold fills)" },
  { fg: "ink", bg: "gold-light", min: BODY, use: "Text on gold highlight" },
  { fg: "surface", bg: "ink", min: BODY, use: "Light text on ink (secondary button, toast)" },
  { fg: "surface", bg: "danger", min: BODY, use: "Text on destructive buttons" },
  {
    fg: "gold-deep",
    bg: "pearl",
    min: LARGE_OR_UI,
    use: "Gold large text and icons on the pearl ground",
  },
  { fg: "gold-deep", bg: "surface", min: LARGE_OR_UI, use: "Gold large text and icons on cards" },
  {
    fg: "ink-3",
    bg: "pearl",
    min: LARGE_OR_UI,
    use: "Tertiary text, large or UI only (never body)",
  },
  { fg: "ink-3", bg: "surface", min: LARGE_OR_UI, use: "Tertiary text on cards, large or UI only" },
  { fg: "ink-3", bg: "surface-2", min: LARGE_OR_UI, use: "Placeholder in inputs" },
  { fg: "danger", bg: "surface", min: BODY, use: "Error messages" },
  { fg: "danger", bg: "pearl", min: BODY, use: "Error messages on the pearl ground" },
  { fg: "success", bg: "surface", min: BODY, use: "Success text" },
  {
    fg: "success",
    bg: { mix: ["success", 6, "surface"] },
    min: BODY,
    use: "Success badge text on its tint",
  },
  {
    fg: "ink",
    bg: { mix: ["warning", 14, "surface"] },
    min: BODY,
    use: "Text on the warning tint",
  },
  { fg: "warning", bg: "surface", min: LARGE_OR_UI, use: "Warning icons and large text" },
  {
    fg: "gold",
    bg: "ink",
    min: LARGE_OR_UI,
    use: "Focus ring: gold outer ring against the ink ring",
  },
  {
    fg: "ink",
    bg: "pearl",
    min: LARGE_OR_UI,
    use: "Focus ring: ink ring against the pearl ground",
  },
];

type Rgb = readonly [number, number, number];

export function parseHex(hex: string): Rgb {
  // The page reads computed values, and the production CSS minifier shortens #ffffff to #fff.
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`not a 3- or 6-digit hex colour: ${hex}`);
  const digits = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  const n = parseInt(digits, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG contrast ratio of two sRGB colours (1 to 21). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolves a pair side to sRGB; `lookup` returns the hex value of a token name. */
export function resolveColour(ref: ColourRef, lookup: (token: string) => string): Rgb {
  if (typeof ref === "string") return parseHex(lookup(ref));
  const [token, percent, base] = ref.mix;
  const a = parseHex(lookup(token));
  const b = parseHex(lookup(base));
  const t = percent / 100;
  return [0, 1, 2].map((i) => (a[i] ?? 0) * t + (b[i] ?? 0) * (1 - t)) as unknown as Rgb;
}

export const colourLabel = (ref: ColourRef): string =>
  typeof ref === "string" ? ref : `${ref.mix[0]} ${String(ref.mix[1])}% on ${ref.mix[2]}`;

export type ContrastResult = ContrastPair & { ratio: number; pass: boolean };

export function contrastResults(lookup: (token: string) => string): ContrastResult[] {
  return CONTRAST_PAIRS.map((pair) => {
    const ratio = contrast(resolveColour(pair.fg, lookup), resolveColour(pair.bg, lookup));
    return { ...pair, ratio, pass: ratio >= pair.min };
  });
}
