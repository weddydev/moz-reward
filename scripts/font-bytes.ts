/**
 * `pnpm font:bytes` (PD-02): bytes of the self-hosted Fraunces and Manrope files in the production build, per
 * family and style, from the build's @font-face rules (Latin subset = the files the app preloads or loads).
 * Run after `pnpm e2e --build-only`. DESIGN §12 font budget; DECISIONS records the numbers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dist = path.resolve(__dirname, "../.next-e2e/static");
const cssDir = path.join(dist, "chunks");
const seen = new Map<string, { family: string; style: string; bytes: number; latin: boolean }>();
for (const f of readdirSync(cssDir).filter((n) => n.endsWith(".css"))) {
  const css = readFileSync(path.join(cssDir, f), "utf8");
  for (const m of css.matchAll(/@font-face\{([^}]*)\}/g)) {
    const body = m[1] ?? "";
    const family = /font-family:\s*"?([^;"]+)"?;/.exec(body)?.[1] ?? "";
    if (!/^(Fraunces|Manrope)$/.test(family)) continue;
    const file = /url\(\.\.\/media\/([^)]+)\)/.exec(body)?.[1];
    if (!file || seen.has(file)) continue;
    const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal";
    // Minified CSS writes the Latin range 0000-00FF as `U+??`.
    const latin = /unicode-range:\s*U\+(?:0000-00FF|\?\?)/i.test(body);
    seen.set(file, { family, style, bytes: statSync(path.join(dist, "media", file)).size, latin });
  }
}
const rows = [...seen.values()];
const sum = (xs: typeof rows): number => xs.reduce((s, x) => s + x.bytes, 0);
for (const family of ["Fraunces", "Manrope"]) {
  for (const style of ["normal", "italic"]) {
    const xs = rows.filter((r) => r.family === family && r.style === style);
    if (xs.length === 0) continue;
    const latin = xs.filter((x) => x.latin);
    process.stdout.write(
      `${family} ${style}: latin ${String(Math.round(sum(latin) / 1024))} KB (${String(latin.length)} file), all subsets ${String(Math.round(sum(xs) / 1024))} KB (${String(xs.length)} files)\n`,
    );
  }
}
