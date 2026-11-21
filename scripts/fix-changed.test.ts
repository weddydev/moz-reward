import { describe, expect, it } from "vitest";
import { selectFiles } from "./fix-changed";

describe("[P0-14] fix:changed file selection", () => {
  it("[P0-14] lints code, formats what the pre-commit hook formats, skips its exclusions, no duplicates", () => {
    const { lint, format } = selectFiles([
      "src/a.ts",
      "src/a.ts",
      "scripts/lib/watchdog.mjs",
      "src/styles/molten.css",
      "docs/DESIGN.md",
      "progress/PROGRESS.md",
      "README.md",
      "pnpm-lock.yaml",
      ".github/workflows/ci.yml",
      "public/icon.png",
      "",
    ]);
    expect(lint).toEqual(["scripts/lib/watchdog.mjs", "src/a.ts"]);
    expect(format).toEqual([
      ".github/workflows/ci.yml",
      "README.md",
      "scripts/lib/watchdog.mjs",
      "src/a.ts",
      "src/styles/molten.css",
    ]);
  });
});
