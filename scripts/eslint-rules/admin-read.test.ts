/**
 * RuleTester for `moz/admin-read` (C-34): a base-module call whose scope can be an AdminScope is flagged unless a
 * reason is given. Type-aware, so it runs through the TypeScript project service on a virtual file.
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import rule from "./admin-read.mjs";

RuleTester.describe = describe;
// The first typed lint starts the TypeScript project service (a few seconds cold).
RuleTester.it = (name: string, fn: () => void) => {
  it(name, fn, 30_000);
};

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      projectService: { allowDefaultProject: ["*.ts"], defaultProject: "tsconfig.json" },
      tsconfigRootDir: process.cwd(),
    },
  },
});
const SCOPES =
  'type AdminScope = { kind: "admin" };\ntype ShopScope = { kind: "shop" };\n' +
  "declare const admin: AdminScope;\ndeclare const shop: ShopScope;\n";
const error = (callee: string) => ({ messageId: "adminScope", data: { callee } });
const file = "admin-read-fixture.ts";

describe("[P1-18] moz/admin-read", () => {
  tester.run("admin-read", rule, {
    valid: [
      // A shop scope is never a cross-shop read.
      {
        code: `import { withScope } from "./_base";\n${SCOPES}export const f = () => withScope(shop, 1);`,
        filename: file,
      },
      {
        code: `import * as base from "./_base";\n${SCOPES}export const f = () => base.withScope(shop, 1);`,
        filename: file,
      },
      // An admin write that says why it is not a cross-shop read.
      {
        code: `import * as base from "./_base";\n${SCOPES}// admin-scope: an audited write of one shop's rows\nexport const f = () => base.transaction(admin, 1);`,
        filename: file,
      },
      // Another module's withScope is not the repo base.
      {
        code: `import * as other from "./other";\n${SCOPES}export const f = () => other.withScope(admin, 1);`,
        filename: file,
      },
    ],
    invalid: [
      {
        code: `import { withScope } from "./_base";\n${SCOPES}export const f = () => withScope(admin, 1);`,
        filename: file,
        errors: [error("withScope")],
      },
      {
        code: `import * as base from "./_base";\n${SCOPES}export const f = () => base.withScope(admin, 1);`,
        filename: file,
        errors: [error("base.withScope")],
      },
      {
        code: `import * as base from "./_base";\n${SCOPES}export const f = () => base.transaction(admin, 1);`,
        filename: file,
        errors: [error("base.transaction")],
      },
    ],
  });
});
