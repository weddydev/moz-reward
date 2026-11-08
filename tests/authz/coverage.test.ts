import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: every exported server action (`export const x = defineAction(`) in src/ must have an
 * `authzMatrix("x", ...)` entry in tests/authz/. Route handlers get added here when they mutate data.
 */
const ROOT = join(__dirname, "..", "..");

function walk(dir: string, opts: { includeTests: boolean }, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, opts, out);
    else if (/\.(ts|tsx)$/.test(name) && (opts.includeTests || !/\.test\.tsx?$/.test(name))) out.push(full);
  }
  return out;
}

// Anchored to line start so usage examples inside comments are ignored.
const actionNames = walk(join(ROOT, "src"), { includeTests: false }).flatMap((file) =>
  [...readFileSync(file, "utf8").matchAll(/^export const (\w+) = defineAction\(/gm)].map((m) => ({
    name: m[1]!,
    file: relative(ROOT, file),
  })),
);

const matrixSource = walk(join(ROOT, "tests", "authz"), { includeTests: true })
  .filter((f) => f.endsWith(".authz.test.ts"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("authz matrix coverage", () => {
  it("finds the server actions", () => {
    expect(actionNames.length).toBeGreaterThan(0);
  });
  it.each(actionNames)("$name ($file) has an authzMatrix entry", ({ name }) => {
    expect(matrixSource).toContain(`authzMatrix("${name}"`);
  });
});
