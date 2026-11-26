import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as ui from "@/components/ui";
import { GALLERY_PARTS, GALLERY_PRIMITIVES, NOT_A_GALLERY_PART } from "./gallery-list";

const UI_DIR = join(process.cwd(), "src/components/ui");
const GALLERY = readFileSync(join(process.cwd(), "src/features/dev/UiGallery.tsx"), "utf8");
const OVERLAY_DEMOS = readFileSync(
  join(process.cwd(), "src/features/dev/OverlayDemos.tsx"),
  "utf8",
);
const MOLTEN_PARTS = readFileSync(join(process.cwd(), "src/features/dev/MoltenParts.tsx"), "utf8");
const MOTION_DIR = join(process.cwd(), "src/components/motion");

/** PascalCase components a file exports (`export function X`, `export const X`); ALL_CAPS constants are not. */
const componentExports = (dir: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .flatMap((f) =>
      [
        ...readFileSync(join(dir, f), "utf8").matchAll(
          /^export (?:function ([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b|const ([A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*)\b)/gm,
        ),
      ].map((m) => m[1] ?? m[2] ?? ""),
    );

describe("[P0-09] gallery list completeness (AC 1)", () => {
  it("[P0-09] lists exactly the primitives exported from src/components/ui", () => {
    const exported = Object.keys(ui)
      .filter((name) => /^[A-Z]/.test(name))
      .sort();
    expect([...GALLERY_PRIMITIVES].sort()).toEqual(exported);
  });

  it("[P0-09] the gallery renders a block for every listed primitive", () => {
    const source = GALLERY + OVERLAY_DEMOS + MOLTEN_PARTS;
    const demos = new Set([...source.matchAll(/<Demo\s+name="([A-Za-z]+)"/g)].map((m) => m[1]));
    expect([...GALLERY_PRIMITIVES, ...GALLERY_PARTS].filter((n) => !demos.has(n))).toEqual([]);
  });

  it("[P0-09] C-94 (P1-C close): every component built is shown, or says why not (ui and motion)", () => {
    const listed = new Set<string>([...GALLERY_PRIMITIVES, ...GALLERY_PARTS]);
    const found = [...componentExports(UI_DIR), ...componentExports(MOTION_DIR)];
    expect(found.filter((n) => !listed.has(n) && !Object.hasOwn(NOT_A_GALLERY_PART, n))).toEqual(
      [],
    );
    // No stale entries: every listed part and every exemption still exists.
    const all = new Set(found);
    expect(GALLERY_PARTS.filter((n) => !all.has(n))).toEqual([]);
    expect(Object.keys(NOT_A_GALLERY_PART).filter((n) => !all.has(n))).toEqual([]);
    expect(
      GALLERY_PARTS.filter((n) => (GALLERY_PRIMITIVES as readonly string[]).includes(n)),
    ).toEqual([]);
  });
});

describe("[P0-09] component class rules (AC 7)", () => {
  const files = readdirSync(UI_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => ({ file: f, text: readFileSync(join(UI_DIR, f), "utf8") }));
  const classStrings = (text: string): string[] =>
    [...text.matchAll(/(?:className=|cx\(|classes?\s*[:=]\s*)\s*\{?\s*["'`]([^"'`]*)["'`]/g)]
      .map((m) => m[1] ?? "")
      .concat([...text.matchAll(/"([a-z0-9:[\]()_\-./%! ]+)"/g)].map((m) => m[1] ?? ""));

  it("[P0-09] no important modifier (`!` prefix or suffix, `!important`) in component classes", () => {
    const hits = files.flatMap(({ file, text }) =>
      classStrings(text)
        .flatMap((s) => s.split(/\s+/))
        .filter((c) => /^!|!$|^[a-z-]+:!/.test(c))
        .map((c) => `${file}: ${c}`)
        .concat(text.includes("!important") ? [`${file}: !important`] : []),
    );
    expect(hits).toEqual([]);
  });

  it("[P0-09] type sizes come only from the scale (no arbitrary text-[…] sizes)", () => {
    const hits = files.flatMap(({ file, text }) =>
      [...text.matchAll(/\btext-\[(\d[^\]]*)\]/g)].map((m) => `${file}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
