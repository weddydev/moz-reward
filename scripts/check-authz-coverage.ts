/**
 * Authorisation coverage (P0-07, SECURITY §3), part of `pnpm lint` and so of CI. Every exported server action
 * (`export const x = defineAction(…)`) and every route handler (an exported GET/POST/PUT/PATCH/DELETE in
 * `src/app/**\/route.ts`) must have an `authzMatrix("<name>", …)` entry in `tests/authz/*.authz.test.ts`.
 * Route entries are named "<METHOD> <path>", e.g. `authzMatrix("POST /api/uploads", …)`.
 * Parsed with the TypeScript AST, so comments, strings and re-exports can't fool it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { isDirectRun } from "../src/lib/is-direct-run";

const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Route files that are deliberately outside the matrix, with the reason. Keep this list short. */
export const EXEMPT_ROUTES: Readonly<Record<string, string>> = {
  "src/app/api/auth/[...all]/route.ts":
    "Better Auth's own handler; its endpoints are guarded by the hooks in src/server/auth/auth.ts (P0-06 tests)",
  "src/app/api/test/[action]/route.ts":
    "test-only API: 404 for every method unless APP_ENV=test (tests/integration/test-api.test.ts)",
};

/** An endpoint; `problem` is set when it can never be valid (e.g. a server action outside the template). */
export type Entry = { name: string; file: string; problem?: string };

const NOT_TEMPLATE =
  'exported from a "use server" file but not `export const x = defineAction(…)`: every export there is a callable server action';

const hasUseServer = (statements: ts.NodeArray<ts.Statement>): boolean =>
  statements.some(
    (st) =>
      ts.isExpressionStatement(st) &&
      ts.isStringLiteral(st.expression) &&
      st.expression.text === "use server",
  );

/** Functions with their own "use server" directive (inline server actions), anywhere in the file. */
function inlineServerActions(sf: ts.SourceFile, file: string): Entry[] {
  const out: Entry[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isFunctionLike(node) &&
      "body" in node &&
      node.body &&
      ts.isBlock(node.body) &&
      hasUseServer(node.body.statements)
    ) {
      const name = node.name && ts.isIdentifier(node.name) ? node.name.text : "anonymous function";
      out.push({
        name: `inline "use server" in ${name}`,
        file,
        problem:
          'inline server actions bypass the action template; move it to a "use server" file as defineAction',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const isExported = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) &&
  (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const calls = (init: ts.Expression | undefined, fn: string): boolean =>
  !!init &&
  ts.isCallExpression(init) &&
  ts.isIdentifier(init.expression) &&
  init.expression.text === fn;

/** URL path of an App Router route file: route groups dropped, dynamic segments kept. */
export function routePath(file: string): string {
  const rel = file
    .replace(/\\/g, "/")
    .replace(/^src\/app/, "")
    .replace(/\/route\.tsx?$/, "");
  const segments = rel.split("/").filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join("/")}`;
}

/** Actions and route handlers exported by one source file. */
export function exportedEndpoints(file: string, source: string): Entry[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const isRoute = /(^|\/)route\.tsx?$/.test(file.replace(/\\/g, "/"));
  const serverFile = hasUseServer(sf.statements);
  const out: Entry[] = [];
  for (const stmt of sf.statements) {
    if (serverFile && ts.isExportDeclaration(stmt)) {
      // `export { a }` / `export * from` in a server file can't be checked as defineAction.
      const spec =
        stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
          ? stmt.moduleSpecifier.text
          : "?";
      const names =
        stmt.exportClause && ts.isNamedExports(stmt.exportClause)
          ? stmt.exportClause.elements.map((el) => el.name.text)
          : [`* from ${spec}`];
      for (const name of names) out.push({ name, file, problem: NOT_TEMPLATE });
      continue;
    }
    if (!isExported(stmt)) continue;
    const names: Array<{ name: string; init?: ts.Expression }> = [];
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name))
          names.push({ name: d.name.text, ...(d.initializer ? { init: d.initializer } : {}) });
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.push({ name: stmt.name.text });
    }
    for (const { name, init } of names) {
      if (isRoute && HTTP_METHODS.has(name)) out.push({ name: `${name} ${routePath(file)}`, file });
      else if (calls(init, "defineAction")) out.push({ name, file });
      else if (serverFile) out.push({ name, file, problem: NOT_TEMPLATE });
    }
  }
  return [...out, ...inlineServerActions(sf, file)];
}

/** Names given to `authzMatrix("…", …)` calls in matrix files. */
export function matrixNames(source: string): Set<string> {
  const sf = ts.createSourceFile("m.ts", source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "authzMatrix" &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Endpoints with no matrix entry (exempt route files skipped). */
export function uncovered(root: string): Entry[] {
  const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");
  const endpoints = walk(path.join(root, "src"))
    .filter((f) => !(rel(f) in EXEMPT_ROUTES))
    .flatMap((f) => exportedEndpoints(rel(f), readFileSync(f, "utf8")));
  const matrix = new Set<string>();
  for (const f of readdirSync(path.join(root, "tests", "authz"))) {
    if (!f.endsWith(".authz.test.ts")) continue;
    for (const n of matrixNames(readFileSync(path.join(root, "tests", "authz", f), "utf8")))
      matrix.add(n);
  }
  return endpoints.filter((e) => e.problem !== undefined || !matrix.has(e.name));
}

function main(): void {
  const missing = uncovered(process.cwd());
  if (missing.length > 0) {
    console.error(
      `[authz] ${String(missing.length)} endpoint(s) outside the action template or without an authzMatrix entry in tests/authz/*.authz.test.ts:\n` +
        missing
          .map((m) => `  - ${m.name}  (${m.file})${m.problem ? `: ${m.problem}` : ""}`)
          .join("\n"),
    );
    process.exit(1);
  }
}

if (isDirectRun(import.meta.url)) main();
