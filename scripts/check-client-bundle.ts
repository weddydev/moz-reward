/**
 * `pnpm check:bundle` (P0-02, SECURITY: secrets never reach client bundles). After `next build`, scans every file
 * under `<distDir>/static` for the NAME of each server-only variable in `.env.example` (anything not
 * `NEXT_PUBLIC_*`). A name in the browser bundle means server config leaked into client code, even if the value
 * did not. Exits 1 on any hit that is not on the reviewed allowlist below.
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

export interface Hit {
  file: string;
  name: string;
}

export function findHits(files: { file: string; content: string }[], names: string[]): Hit[] {
  const hits: Hit[] = [];
  for (const { file, content } of files) {
    for (const name of names) {
      let scrubbed = content;
      for (const a of ALLOWED) if (a.name === name) scrubbed = scrubbed.replace(a.pattern, "");
      if (new RegExp(`\\b${name}\\b`).test(scrubbed)) hits.push({ file, name });
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
  process.stdout.write(
    `[check:bundle] OK: ${String(names.length)} server variable names checked across ${String(files.length)} files in ${staticDir}\n`,
  );
}

if (isDirectRun(import.meta.url)) main();
