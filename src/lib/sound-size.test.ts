import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * P0-11: each module ≤ 2 KB gzip. Measured on the transpiled, comment-free but unminified code, which is
 * an upper bound for what ships (the bundler also minifies).
 */
describe("[P0-11] sound and haptics stay small", () => {
  it.each(["sound.ts", "haptics.ts"])("%s is ≤ 2 KB gzip", (file) => {
    const source = readFileSync(path.join(import.meta.dirname, file), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
      },
    });
    const bytes = gzipSync(outputText).length;
    expect(bytes).toBeGreaterThan(100);
    expect(bytes).toBeLessThanOrEqual(2048);
  });
});
