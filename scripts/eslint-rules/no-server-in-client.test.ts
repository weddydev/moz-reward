/**
 * RuleTester for the project's own ESLint rules (CR-L7, P0-14): each form a rule must catch is a negative
 * fixture here, so a regression in the rule fails `pnpm check`, not a later code review.
 */
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import plugin from "./no-server-in-client.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2022, sourceType: "module" },
});
const CLIENT = '"use client";\n';
const error = (source: string) => ({ messageId: "serverInClient", data: { source } });

describe("[P0-14] moz/no-server-in-client", () => {
  tester.run("no-server-in-client", plugin.rules["no-server-in-client"], {
    valid: [
      // Server components and plain modules may import server code.
      'import { db } from "@/server/db/client";',
      // Client files: types are erased; shared and UI code is fine.
      `${CLIENT}import type { Principal } from "@/server/authz/policies";`,
      `${CLIENT}export type { Principal } from "@/server/authz/policies";`,
      `${CLIENT}import { Button } from "@/components/ui/Button";`,
      `${CLIENT}import { observer } from "./observer";`,
      // A directive that is not the file's first statement is not a client boundary.
      `const a = 1;\n"use client";\nimport { db } from "@/server/db/client";`,
    ],
    invalid: [
      {
        code: `${CLIENT}import { db } from "@/server/db/client";`,
        errors: [error("@/server/db/client")],
      },
      { code: `${CLIENT}import "server-only";`, errors: [error("server-only")] },
      { code: `${CLIENT}import { x } from "@/server";`, errors: [error("@/server")] },
      {
        code: `${CLIENT}import { x } from "../../server/env";`,
        errors: [error("../../server/env")],
      },
      { code: `${CLIENT}export { env } from "@/server/env";`, errors: [error("@/server/env")] },
      {
        code: `${CLIENT}export * from "@/server/repos/users";`,
        errors: [error("@/server/repos/users")],
      },
      {
        code: `${CLIENT}const m = import("@/server/auth/auth");`,
        errors: [error("@/server/auth/auth")],
      },
    ],
  });
});

describe("[P0-14] moz/require-server-only", () => {
  tester.run("require-server-only", plugin.rules["require-server-only"], {
    valid: ['import "server-only";\nexport const x = 1;'],
    invalid: [{ code: "export const x = 1;", errors: [{ messageId: "missing" }] }],
  });
});
