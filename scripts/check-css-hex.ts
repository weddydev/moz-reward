/**
 * Colours come from tokens only (DESIGN §3, P0-01). ESLint covers TS/TSX; this covers CSS: any hex colour in a
 * `.css` file under src/ other than `src/styles/tokens.css` fails `pnpm lint`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const HEX = /(^|[^&\w])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/;
const ALLOWED = new Set(["src/styles/tokens.css"]);

/** Lines (1-based) of `css` that contain a hex colour, ignoring comments. */
export function hexLines(css: string): number[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  return withoutComments.split("\n").flatMap((line, i) => (HEX.test(line) ? [i + 1] : []));
}

function* cssFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* cssFiles(full);
    else if (name.endsWith(".css")) yield full.split(path.sep).join("/");
  }
}

function main(): void {
  const problems = [...cssFiles("src")]
    .filter((f) => !ALLOWED.has(f))
    .flatMap((f) => hexLines(readFileSync(f, "utf8")).map((line) => `${f}:${line}`));
  if (problems.length > 0) {
    console.error(`[css] hard-coded hex colours (use tokens from src/styles/tokens.css):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
}

if (process.argv[1]?.split("\\").join("/").endsWith("scripts/check-css-hex.ts")) main();
