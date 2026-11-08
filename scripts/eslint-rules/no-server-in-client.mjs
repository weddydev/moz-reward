/**
 * Files marked "use client" must never import server code (ENGINEERING §3, SECURITY: secrets never reach
 * client bundles). Catches `@/server/...`, relative paths into a `server/` folder, and `server-only`.
 * `import type` is allowed: types are erased and ship no server code.
 */
const isServerPath = (source) =>
  source === "server-only" ||
  source === "@/server" ||
  source.startsWith("@/server/") ||
  /(^|\/)server(\/|$)/.test(source.replace(/^(\.\.?\/)+/, "x/"));

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: 'Disallow importing server code from "use client" files' },
    messages: {
      serverInClient:
        '"{{source}}" is server code and cannot be imported from a "use client" file. Pass data from a server component or call a server action instead.',
    },
    schema: [],
  },
  create(context) {
    let isClient = false;
    const check = (node) => {
      if (!isClient || !node.source || typeof node.source.value !== "string") return;
      if (node.importKind === "type" || node.exportKind === "type") return;
      if (isServerPath(node.source.value))
        context.report({
          node: node.source,
          messageId: "serverInClient",
          data: { source: node.source.value },
        });
    };
    return {
      Program(program) {
        isClient = program.body.some(
          (s) => s.type === "ExpressionStatement" && s.directive === "use client",
        );
      },
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression(node) {
        if (
          isClient &&
          node.source.type === "Literal" &&
          typeof node.source.value === "string" &&
          isServerPath(node.source.value)
        ) {
          context.report({
            node: node.source,
            messageId: "serverInClient",
            data: { source: node.source.value },
          });
        }
      },
    };
  },
};

/**
 * Every module under src/server imports "server-only" (ENGINEERING §3), so an accidental client import fails the
 * build. Files that run in plain Node outside Next (drizzle-kit schema, the migrate CLI) are excluded in config.
 * @type {import("eslint").Rule.RuleModule}
 */
const requireServerOnly = {
  meta: {
    type: "problem",
    docs: { description: 'Require `import "server-only"` in server modules' },
    messages: {
      missing: 'Server modules must start with `import "server-only";` (ENGINEERING §3).',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const has = program.body.some(
          (s) => s.type === "ImportDeclaration" && s.source.value === "server-only",
        );
        if (!has)
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "missing" });
      },
    };
  },
};

const plugin = { rules: { "no-server-in-client": rule, "require-server-only": requireServerOnly } };
export default plugin;
