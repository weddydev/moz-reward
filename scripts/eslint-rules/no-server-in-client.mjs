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

const plugin = { rules: { "no-server-in-client": rule } };
export default plugin;
