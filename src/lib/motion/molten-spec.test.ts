import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cssOf, locate, LocatorError, normalise, rootVars } from "./molten-reference";
import { MOLTEN_SPEC, type ProdLocator, type SpecRow } from "./molten-spec";

const ROOT = path.resolve(__dirname, "../../..");
const REFERENCE = "design/reference/molten/index.html";
const LOCK = "src/lib/motion/molten-spec.lock.json";
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");
const reference = read(REFERENCE);

/** Every value whose reference doesn't match DESIGN's quote, as "row / value: why". */
function referenceMismatches(source: string, rows: readonly SpecRow[] = MOLTEN_SPEC): string[] {
  const vars = rootVars(cssOf(source));
  const out: string[] = [];
  for (const row of rows) {
    for (const v of row.values) {
      try {
        const found = normalise(locate(source, v.ref), vars);
        const quoted = normalise(v.value, vars);
        if (found !== quoted)
          out.push(`${row.id} / ${v.name}: reference "${found}", spec "${quoted}"`);
      } catch (e) {
        if (!(e instanceof LocatorError)) throw e;
        out.push(`${row.id} / ${v.name}: ${e.message}`);
      }
    }
  }
  return out;
}

/** Production custom properties: the token sheet's `:root` plus the file's own. */
const tokenVars = rootVars(read("src/styles/tokens.css"));
function prodValue(at: ProdLocator): string {
  if ("value" in at) return String(at.value());
  const source = read(at.file);
  const vars = new Map([...tokenVars, ...rootVars(cssOf(source))]);
  const locator =
    at.part === undefined
      ? { css: at.css, prop: at.prop }
      : { css: at.css, prop: at.prop, part: at.part };
  return normalise(locate(source, locator), vars);
}

const required = MOLTEN_SPEC.filter((r) => r.status === "required");

describe("[PD-01] Molten motion spec (DESIGN §7.4) against the reference and production", () => {
  it("[PD-01] the reference is the frozen one (README fingerprint)", () => {
    const sha = createHash("sha256")
      .update(readFileSync(path.join(ROOT, REFERENCE)))
      .digest("hex");
    expect(read("design/reference/molten/README.md")).toContain(sha);
  });

  it("[PD-01] rows are unique, name their PD task, and quote at least one value unless filled later", () => {
    const ids = MOLTEN_SPEC.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of MOLTEN_SPEC) {
      expect(row.task, row.id).toMatch(/^PD-(0[2-9]|1[01])$/);
      if (row.status === "required") expect(row.values.length, row.id).toBeGreaterThan(0);
    }
  });

  it("[PD-01] every quoted value equals the reference", () => {
    expect(referenceMismatches(reference)).toEqual([]);
  });

  it("[PD-01] self-test: a changed duration or easing in a reference fixture is caught", () => {
    const ripple = reference.replace(/(function ripple[\s\S]*?duration: )720/, "$1721");
    expect(ripple).not.toBe(reference);
    expect(referenceMismatches(ripple)).toEqual([
      'molten-button / ripple: reference "721", spec "720"',
      'press-kit / ripple duration (ms): reference "721", spec "720"',
    ]);
    const press = reference.replace(
      "transition:transform .45s var(--spring),box-shadow .3s var(--ease-out)",
      "transition:transform .5s var(--spring),box-shadow .3s var(--ease-out)",
    );
    expect(press).not.toBe(reference);
    expect(referenceMismatches(press).join("\n")).toContain("molten-button / press transform");
    const gone = reference.replace("function ripple", "function rippel");
    expect(referenceMismatches(gone).join("\n")).toContain('anchor "function ripple" not found');
  });

  it("[PD-01] normalising: units, leading zeros, spacing and variables compare equal", () => {
    const vars = new Map([["--spring", "cubic-bezier(.34,1.56,.64,1)"]]);
    expect(normalise(".45s var(--spring)", vars)).toBe(
      normalise("450ms cubic-bezier(0.34, 1.56, 0.64, 1)"),
    );
    expect(normalise("4.5s linear infinite")).toBe("4500ms linear infinite");
    expect(normalise(".93")).toBe(normalise("0.93"));
    expect(normalise("720")).not.toBe(normalise("721"));
  });

  it.each(required.length > 0 ? required : [null])(
    "[PD-01] required row equals production: %s",
    (row) => {
      if (!row) return; // none required yet: PD-02 onward flip their rows
      const vars = rootVars(cssOf(reference));
      for (const v of row.values) {
        expect(v.prod, `${row.id} / ${v.name} has no production locator`).toBeDefined();
        if (!v.prod) continue;
        expect(prodValue(v.prod), `${row.id} / ${v.name}`).toBe(normalise(v.value, vars));
      }
    },
  );

  it("[PD-01] a required row never goes back (lock file = required rows, and only grows)", () => {
    const lock = JSON.parse(read(LOCK)) as string[];
    expect([...lock].sort()).toEqual(required.map((r) => r.id).sort());
    const git = (...args: string[]): string =>
      execFileSync("git", args, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    // origin/main must be there (CI fetches it before `pnpm check`); only the lock file may be missing on it.
    git("rev-parse", "--verify", "origin/main");
    const onMain = git("ls-tree", "--name-only", "origin/main", LOCK).trim() === LOCK;
    const base = onMain ? (JSON.parse(git("show", `origin/main:${LOCK}`)) as string[]) : [];
    for (const id of base) expect(lock, `${id} was required on main`).toContain(id);
  });
});
