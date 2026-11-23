/**
 * `pnpm check:bundle` (P0-02, SECURITY: secrets never reach client bundles). After `next build`, scans every file
 * under `<distDir>/static` for the NAME of each server-only variable in `.env.example` (anything not
 * `NEXT_PUBLIC_*`). A name in the browser bundle means server config leaked into client code, even if the value
 * did not. Exits 1 on any hit that is not on the reviewed allowlist below.
 *
 * Second check (PD-07): every custom property the built CSS registers with `@property` is on a reviewed list. Tailwind
 * reads every word of every source file as a possible class, so a word like "backdrop-filter" in a comment or string
 * creates that utility and registers its property family; non-inherited registered properties are carried by every
 * element, and nine of them cost the pixel7 FX stress 4–12 fps at 4× CPU (CI 45148036170, KNOWN_ISSUES KI-21).
 *
 * Usage: tsx scripts/check-client-bundle.ts [distDir]   (default `.next`; run `pnpm build` first)
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { isDirectRun } from "../src/lib/is-direct-run";

/** Server variable names declared in an env file (assignment lines only), excluding browser-safe NEXT_PUBLIC_*. */
export function serverVariableNames(envExample: string): string[] {
  const names = [...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1] ?? "");
  return [...new Set(names)].filter((n) => n !== "" && !n.startsWith("NEXT_PUBLIC_"));
}

/**
 * Reviewed false positives: a library mentions the NAME in browser code, with no value and no server code.
 * Each entry matches the exact shape that is allowed (minified identifiers vary per build), so any other
 * occurrence of the name still fails.
 */
export const ALLOWED: readonly { name: string; pattern: RegExp; why: string }[] = [
  {
    name: "AUTH_SECRET",
    pattern: /get AUTH_SECRET\(\)\{return [\w$]+\("AUTH_SECRET"\)\}/g,
    why: "@better-auth/core env shim (shared by its client): a getter that reads process.env at runtime, which is empty in the browser. Name only, no value; the server secret is never inlined.",
  },
];

/**
 * Custom properties the built CSS may register (`@property`): Tailwind's for the utilities we use, and ours. A new
 * name fails the check: if a utility really needs it, add it here in the same commit (it then costs every element
 * on every page); if a stray word created it, reword the source.
 */
export const REGISTERED_PROPERTIES: readonly string[] = [
  "--m-a",
  "--tw-blur",
  "--tw-border-style",
  "--tw-brightness",
  "--tw-contrast",
  "--tw-divide-y-reverse",
  "--tw-drop-shadow",
  "--tw-drop-shadow-alpha",
  "--tw-drop-shadow-color",
  "--tw-drop-shadow-size",
  "--tw-ease",
  "--tw-font-weight",
  "--tw-gradient-from",
  "--tw-gradient-from-position",
  "--tw-gradient-position",
  "--tw-gradient-stops",
  "--tw-gradient-to",
  "--tw-gradient-to-position",
  "--tw-gradient-via",
  "--tw-gradient-via-position",
  "--tw-gradient-via-stops",
  "--tw-grayscale",
  "--tw-hue-rotate",
  "--tw-inset-ring-color",
  "--tw-inset-ring-shadow",
  "--tw-inset-shadow",
  "--tw-inset-shadow-alpha",
  "--tw-inset-shadow-color",
  "--tw-invert",
  "--tw-leading",
  "--tw-numeric-figure",
  "--tw-numeric-fraction",
  "--tw-numeric-spacing",
  "--tw-opacity",
  "--tw-ordinal",
  "--tw-outline-style",
  "--tw-ring-color",
  "--tw-ring-inset",
  "--tw-ring-offset-color",
  "--tw-ring-offset-shadow",
  "--tw-ring-offset-width",
  "--tw-ring-shadow",
  "--tw-rotate-x",
  "--tw-rotate-y",
  "--tw-rotate-z",
  "--tw-saturate",
  "--tw-scale-x",
  "--tw-scale-y",
  "--tw-scale-z",
  "--tw-sepia",
  "--tw-shadow",
  "--tw-shadow-alpha",
  "--tw-shadow-color",
  "--tw-skew-x",
  "--tw-skew-y",
  "--tw-slashed-zero",
  "--tw-space-y-reverse",
  "--tw-tracking",
];

/** Names the CSS registers with `@property` that aren't in `allowed`, each once, in order of appearance. */
export function unexpectedRegistrations(css: string, allowed: readonly string[]): string[] {
  const ok = new Set(allowed);
  const found = [...css.matchAll(/@property\s+(--[\w-]+)/g)].map((m) => m[1] ?? "");
  return [...new Set(found)].filter((n) => n !== "" && !ok.has(n));
}

export interface Hit {
  file: string;
  name: string;
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /\w/.test(c);

/** `word` occurs in `text` as a whole word (the `\b…\b` rule) — without building a RegExp from data. */
export function containsWord(text: string, word: string): boolean {
  if (word === "") return false;
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1))
    if (!isWordChar(text[i - 1]) && !isWordChar(text[i + word.length])) return true;
  return false;
}

export function findHits(files: { file: string; content: string }[], names: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const { file, content } of files) {
    for (const name of names) {
      let scrubbed = content;
      for (const a of ALLOWED) if (a.name === name) scrubbed = scrubbed.replace(a.pattern, "");
      if (containsWord(scrubbed, name)) hits.push({ file, name });
    }
  }
  return hits;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function main(): void {
  const distDir = process.argv[2] ?? ".next";
  const staticDir = path.join(distDir, "static");
  if (!existsSync(staticDir)) {
    console.error(`[check:bundle] ${staticDir} not found. Run \`pnpm build\` first.`);
    process.exit(2);
  }
  const names = serverVariableNames(readFileSync(".env.example", "utf8"));
  const files = listFiles(staticDir)
    .filter((f) => /\.(js|mjs|css|html|json|map)$/.test(f))
    .map((file) => ({ file, content: readFileSync(file, "utf8") }));
  const hits = findHits(files, names);
  if (hits.length > 0) {
    console.error("[check:bundle] server-only variable names found in the browser bundle:");
    for (const h of hits) console.error(`  - ${h.name} in ${path.relative(process.cwd(), h.file)}`);
    process.exit(1);
  }
  const css = files.filter((f) => f.file.endsWith(".css")).map((f) => f.content);
  const extra = unexpectedRegistrations(css.join("\n"), REGISTERED_PROPERTIES);
  if (extra.length > 0) {
    console.error(
      "[check:bundle] the CSS registers custom properties not on REGISTERED_PROPERTIES (each is carried by every element; " +
        "a stray class-like word in a source file creates them, KNOWN_ISSUES KI-21):",
    );
    for (const n of extra) console.error(`  - ${n}`);
    process.exit(1);
  }
  process.stdout.write(
    `[check:bundle] OK: ${String(names.length)} server variable names checked across ${String(files.length)} files in ${staticDir}; ${String(REGISTERED_PROPERTIES.length)} registered properties allowed\n`,
  );
}

if (isDirectRun(import.meta.url)) main();
