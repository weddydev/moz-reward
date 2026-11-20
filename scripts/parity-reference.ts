/**
 * `pnpm parity:reference` (PD-01): writes the parity harness's copy of the frozen Molten reference,
 * `tests/parity/reference/index.html` = the original with `data-parity` hooks and the app's own fonts
 * (src/features/dev/molten/parity-parts.ts). The original in design/reference/molten/ is never touched; the
 * copy's photos are served from it. A unit test fails if the committed copy and this output ever differ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { addParityHooks, withAppFonts } from "../src/features/dev/molten/parity-parts";

const root = path.resolve(__dirname, "..");
const original = readFileSync(path.join(root, "design/reference/molten/index.html"), "utf8");
const out = path.join(root, "tests/parity/reference/index.html");
writeFileSync(out, addParityHooks(withAppFonts(original)));
process.stdout.write(`[parity] wrote ${path.relative(root, out)}\n`);
