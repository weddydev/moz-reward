/**
 * Test titles must carry a task or journey ID (TESTING §7): `[P1-11] …`, `[J2] …` or `[S-03] …`.
 * A test is covered if its own title or any enclosing `describe` title has one.
 * Usage: `pnpm test:titles` (warns) · `pnpm test:titles --strict` (exit 1 on any untagged test, used in CI).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const TAG = /\[(?:P\d-\d{2}|S-\d{2}|J\d{1,2})\]/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const ROOTS = ["src", "tests"];
const CALLEES = new Set(["it", "test", "describe"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (TEST_FILE.test(name)) yield full;
  }
}

/** `it`, `test.each(...)`, `describe.skip`, `test.describe.serial` → base name + whether it is a describe. */
function classify(expr: ts.Expression): { base: string; isDescribe: boolean } | null {
  const names: string[] = [];
  let e: ts.Expression = expr;
  for (;;) {
    if (ts.isCallExpression(e))
      e = e.expression; // it.each([...])("title")
    else if (ts.isPropertyAccessExpression(e)) {
      names.unshift(e.name.text);
      e = e.expression;
    } else break;
  }
  if (!ts.isIdentifier(e) || !CALLEES.has(e.text)) return null;
  if (
    names.some((n) =>
      [
        "beforeEach",
        "afterEach",
        "beforeAll",
        "afterAll",
        "use",
        "skip",
        "fail",
        "setTimeout",
        "step",
      ].includes(n),
    ) &&
    !names.includes("describe")
  ) {
    // test.skip(...) with a string title is still a test; bare test.use/test.beforeEach are not.
    if (!(
      names.length === 1 &&
      (names[0] === "skip" || names[0] === "only" || names[0] === "fail")
    ))
      return null;
  }
  return { base: e.text, isDescribe: e.text === "describe" || names.includes("describe") };
}

const titleOf = (arg: ts.Expression | undefined): string | null => {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg))
    return arg.head.text + arg.templateSpans.map((s) => `\${}${s.literal.text}`).join("");
  return null;
};

export function untaggedTests(file: string, source: string): string[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems: string[] = [];
  const visit = (node: ts.Node, tagged: boolean): void => {
    if (ts.isCallExpression(node)) {
      const kind = classify(node.expression);
      const title = titleOf(node.arguments[0]);
      if (kind && title !== null) {
        const here = tagged || TAG.test(title);
        if (!kind.isDescribe && !here)
          problems.push(
            `${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}  ${title}`,
          );
        node.arguments.forEach((a) => {
          visit(a, here);
        });
        return;
      }
    }
    ts.forEachChild(node, (c) => {
      visit(c, tagged);
    });
  };
  visit(sf, false);
  return problems;
}

function main(): void {
  const strict = process.argv.includes("--strict");
  const problems = ROOTS.flatMap((root) => [...walk(root)]).flatMap((f) =>
    untaggedTests(f.replaceAll("\\", "/"), readFileSync(f, "utf8")),
  );
  if (problems.length === 0) {
    console.warn("[titles] every test title carries a task or journey ID");
    return;
  }
  console.warn(
    `[titles] ${problems.length} test(s) without [Pn-nn]/[Jn]/[S-nn] in their title or describe:\n${problems.map((p) => `  ${p}`).join("\n")}`,
  );
  if (strict) process.exit(1);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/check-test-titles.ts")) main();
