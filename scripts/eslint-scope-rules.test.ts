import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * [P0-20] C-12: the scope import allowlists in eslint.config.mjs. Lints source text as if it lived at a real
 * path (existing files, so the type-aware config resolves them), and reads only no-restricted-imports results.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message);
}

const SYSTEM = `import { systemScope } from "@/server/authz/scope";\nexport const s = systemScope("a real reason here");\n`;
const AUTH = `import { authScope } from "@/server/authz/scope";\nexport const s = authScope("a real reason here");\n`;
const DB = `import { dbAs } from "@/server/db/client";\nexport const d = dbAs;\n`;
const OWNER = `import { testOwnerDb } from "@/server/db/client";\nexport const d = testOwnerDb;\n`;

describe("[P0-20] scope import allowlists (C-12)", { timeout: 60_000 }, () => {
  // The first lint builds the TypeScript program for the whole project (cold, over 60 s on a busy laptop
  // during the full unit run): do it once in setup, so each test's timeout covers only its own lints.
  beforeAll(async () => {
    await eslint.lintText("export {};\n", { filePath: "src/server/repos/shops.ts" });
  }, 240_000);

  it("refuses systemScope in request code and repositories, allows it in jobs and the listed handler", async () => {
    expect(await restricted("src/server/repos/shops.ts", SYSTEM)).toEqual([
      expect.stringMatching(/systemScope \(BYPASSRLS, worker only\)/),
    ]);
    expect(await restricted("src/server/auth/staff-login.ts", SYSTEM)).toHaveLength(1);
    expect(await restricted("src/server/services/flags.ts", SYSTEM)).toHaveLength(1);
    expect(await restricted("src/server/jobs/relay.ts", SYSTEM)).toEqual([]);
    expect(await restricted("src/server/auth/lockout-email.ts", SYSTEM)).toEqual([]);
  });

  it("allows authScope only in the identity layer", async () => {
    expect(await restricted("src/server/repos/shops.ts", AUTH)).toHaveLength(1);
    expect(await restricted("src/server/jobs/relay.ts", AUTH)).toHaveLength(1);
    expect(await restricted("src/server/auth/staff-login.ts", AUTH)).toEqual([]);
    expect(await restricted("src/server/authz/principal.ts", AUTH)).toEqual([]);
  });

  it("keeps the raw role pools in the repo base and identity layer, and the owner DB in fixtures", async () => {
    expect(await restricted("src/server/services/flags.ts", DB)).toHaveLength(1);
    expect(await restricted("src/server/repos/_base.ts", DB)).toEqual([]);
    expect(await restricted("src/server/auth/auth.ts", DB)).toEqual([]);
    expect(await restricted("src/server/repos/_base.ts", OWNER)).toHaveLength(1);
    expect(await restricted("src/server/testing/factories.ts", OWNER)).toEqual([]);
  });
});
