/**
 * C-34 (P0-20 review, SECURITY §3): admin cross-shop reads go only through `adminRead`, which writes the
 * `admin.read` audit row in the same transaction. This type-aware rule flags `withScope(...)` / `transaction(...)`
 * from the repo base when the scope argument can be an `AdminScope` (a `kind: "admin"` member in its type).
 * Admin work that is not a cross-shop read (an admin-only global row, an audited write, the action template's
 * transaction) states why with a comment in or just above the enclosing function:
 *   // admin-scope: <reason of at least 10 characters>
 */
const BASE_CALLS = new Set(["withScope", "transaction"]);
const MARKER = /admin-scope:\s*(.+)$/m;
const isBaseModule = (source) => /(^|\/)repos\/_base$/.test(source) || source === "./_base";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Admin-scoped DB access goes through adminRead unless a reason is given" },
    messages: {
      adminScope:
        '`{{callee}}` with a scope that can be an AdminScope: read other shops\' rows through `adminRead` (audited), or state why this is not a cross-shop read with "// admin-scope: <reason>" in or above the function (C-34).',
    },
    schema: [],
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services?.program || !services.esTreeNodeToTSNodeMap) return {};
    const checker = services.program.getTypeChecker();
    const imported = new Set();

    const kindIsAdmin = (t, at) => {
      const kind = t.getProperty("kind");
      if (!kind) return false;
      const kt = checker.getTypeOfSymbolAtLocation(kind, at);
      const parts = kt.isUnion() ? kt.types : [kt];
      return parts.some((k) => k.isStringLiteral() && k.value === "admin");
    };
    const mayBeAdmin = (type, at) => {
      const base = type.isTypeParameter() ? (checker.getBaseConstraintOfType(type) ?? type) : type;
      const parts = base.isUnion() ? base.types : [base];
      return parts.some((t) => kindIsAdmin(t, at));
    };

    const FUNCTIONS = new Set([
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
    ]);
    const WRAPPERS = new Set([
      "VariableDeclarator",
      "VariableDeclaration",
      "ExportNamedDeclaration",
      "ExportDefaultDeclaration",
    ]);
    const isMarker = (c) => (MARKER.exec(c.value)?.[1]?.trim() ?? "").length >= 10;

    /** A marker inside any enclosing function, or in the comments just above its declaration. */
    const hasMarker = (node) => {
      const source = context.sourceCode;
      for (let n = node.parent; n; n = n.parent) {
        if (!FUNCTIONS.has(n.type)) continue;
        let outer = n;
        while (outer.parent && WRAPPERS.has(outer.parent.type)) outer = outer.parent;
        if ([...source.getCommentsBefore(outer), ...source.getCommentsInside(n)].some(isMarker))
          return true;
      }
      return false;
    };

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string" || !isBaseModule(node.source.value)) return;
        for (const s of node.specifiers) {
          if (s.type === "ImportSpecifier" && s.imported.type === "Identifier") {
            if (BASE_CALLS.has(s.imported.name)) imported.add(s.local.name);
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || !imported.has(node.callee.name)) return;
        const arg = node.arguments[0];
        if (!arg) return;
        const tsNode = services.esTreeNodeToTSNodeMap.get(arg);
        if (!mayBeAdmin(checker.getTypeAtLocation(tsNode), tsNode)) return;
        if (hasMarker(node)) return;
        context.report({ node: arg, messageId: "adminScope", data: { callee: node.callee.name } });
      },
    };
  },
};

export default rule;
