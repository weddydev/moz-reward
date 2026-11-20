/**
 * Reads motion values out of the Molten reference (`design/reference/molten/index.html`) and out of production
 * CSS, so `molten-spec.test.ts` can prove DESIGN §7.4 quotes the reference and production matches it (PD-01).
 * Pure string functions: no DOM, no file access (the test reads the files).
 */

/** A value in a CSS rule: `selector { prop: … }`; `part` picks one comma-separated item of a transition or
 *  animation list by its first word (the property name, or the keyframes name), which is then dropped. */
export type CssLocator = { css: string; prop: string; part?: string };
/** A value in a script: the `nth` (0-based) match of `pattern` (a regex literal with the `g` flag and one capture
 *  group, never built from a string: Semgrep detect-non-literal-regexp) after the first occurrence of
 *  the anchor text `js`. `in: "page"` searches the whole page (markup attributes) instead of the scripts. */
export type JsLocator = { js: string; pattern: RegExp; nth?: number; in?: "page" };
export type Locator = CssLocator | JsLocator;

const STYLE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** All inline `<style>` text of an HTML page (or the text itself when it is plain CSS). */
export function cssOf(source: string): string {
  const blocks = [...source.matchAll(STYLE)].map((m) => m[1] ?? "");
  return blocks.length > 0 ? blocks.join("\n") : source;
}

/** All inline `<script>` text of an HTML page (or the text itself when it is plain JS). */
export function jsOf(source: string): string {
  const blocks = [...source.matchAll(SCRIPT)].map((m) => m[1] ?? "");
  return blocks.length > 0 ? blocks.join("\n") : source;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Flat `selector → declarations` for every innermost rule (rules inside @media/@supports included; a selector
 *  that appears more than once keeps every block, in source order). */
export function cssRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: (m[1] ?? "").trim().replace(/\s+/g, " "), body: m[2] ?? "" });
  }
  return rules;
}

/** Splits on commas that are not inside parentheses. */
export function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Declarations of a rule body, `prop → value` (last one wins, like the cascade within a block). */
export function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of body.split(/;(?![^(]*\))/)) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    map.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
  }
  return map;
}

/** Custom properties declared on `:root` (first block wins, so `@supports` fallbacks don't replace the value). */
export function rootVars(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rule of cssRules(css)) {
    if (rule.selector !== ":root") continue;
    for (const [k, v] of declarations(rule.body))
      if (k.startsWith("--") && !vars.has(k)) vars.set(k, v);
  }
  return vars;
}

export class LocatorError extends Error {}

/** The raw value a locator points at, or a `LocatorError` saying why it can't be found. */
export function locate(source: string, at: Locator): string {
  if ("css" in at) {
    const hits = cssRules(cssOf(source))
      .filter((r) => r.selector === at.css)
      .map((r) => declarations(r.body).get(at.prop))
      .filter((v): v is string => v !== undefined);
    const value = hits.at(-1);
    if (value === undefined) throw new LocatorError(`no "${at.prop}" in rule "${at.css}"`);
    if (!at.part) return value;
    const item = splitTop(value).find((x) => x.split(/\s+/)[0] === at.part);
    if (!item)
      throw new LocatorError(`no "${at.part}" item in "${at.css} { ${at.prop}: ${value} }"`);
    return item.split(/\s+/).slice(1).join(" ");
  }
  const js = at.in === "page" ? source : jsOf(source);
  const start = js.indexOf(at.js);
  if (start < 0) throw new LocatorError(`anchor "${at.js}" not found in the script`);
  if (!at.pattern.global) throw new LocatorError(`${String(at.pattern)} needs the g flag`);
  const nth = at.nth ?? 0;
  const m = [...js.slice(start).matchAll(at.pattern)][nth];
  if (!m)
    throw new LocatorError(
      `match ${String(nth)} of ${String(at.pattern)} after "${at.js}" not found`,
    );
  const value = m[1];
  if (value === undefined) throw new LocatorError(`${String(at.pattern)} has no capture group`);
  return value;
}

const num = (s: string): string => {
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : s;
};

/**
 * Canonical form for comparing two motion values: `var(--x)` resolved (recursively) against `vars`, durations in
 * ms (`.45s` → `450ms`), numbers without leading zeros or padding (`0.22` = `.22`), whitespace collapsed, and
 * spaces around commas and parentheses removed. A bare number stays a number (`720` = `720.0`).
 */
export function normalise(value: string, vars: ReadonlyMap<string, string> = new Map()): string {
  let v = value.trim();
  for (let i = 0; i < 10 && v.includes("var("); i += 1) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (_, name: string, fb?: string) => {
      return vars.get(name) ?? fb ?? `var(${name})`;
    });
  }
  return v
    .replace(
      /(^|[^\w.-])(-?\d*\.?\d+)s\b/g,
      (_, pre: string, n: string) => `${pre}${num(String(Number(n) * 1000))}ms`,
    )
    .replace(
      /(^|[^\w.#-])(-?\d*\.\d+|-?\d+)(?![\w.])/g,
      (_, pre: string, n: string) => `${pre}${num(n)}`,
    )
    .replace(/(-?\d*\.?\d+)ms/g, (_, n: string) => `${num(n)}ms`)
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .trim();
}
