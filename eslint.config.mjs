import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";
import moz from "./scripts/eslint-rules/no-server-in-client.mjs";

/** A hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) anywhere in a string, but not an HTML entity like &#123;. */
const HEX_COLOUR = "(^|[^&\\w])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])";
const hexMessage =
  "Hard-coded hex colour: use a design token (var(--…) or a Tailwind token class from tokens.css).";
const hexRules = [
  { selector: `Literal[value=/${HEX_COLOUR}/]`, message: hexMessage },
  { selector: `TemplateElement[value.raw=/${HEX_COLOUR}/]`, message: hexMessage },
  { selector: `JSXText[value=/${HEX_COLOUR}/]`, message: hexMessage },
];

/**
 * Scoped data access (P0-03, SECURITY §3). Only repositories (and DB/auth infrastructure) may import the DB
 * client; only src/server/authz may mint scopes; nobody may forge one with a cast.
 */
const SCOPE_TYPE = "/^(Customer|Shop|Admin|System|Public|Auth|Tenant)?Scope$/";
const scopeCastRules = ["TSAsExpression", "TSTypeAssertion"].map((node) => ({
  selector: `${node}[typeAnnotation.typeName.name=${SCOPE_TYPE}]`,
  message:
    "Scopes come from requireCustomer/requireShopRole/requireAdminRole or systemScope(), never a cast.",
}));
// P0-19: lockout, challenge and attempt counting run in the auth hooks only for HTTP requests (ctx.request). A server-side
// call to a credential endpoint would skip them silently, so it is an error outside the test-only seeding code.
const authApiRules = [
  {
    selector:
      "CallExpression[callee.object.property.name=api][callee.property.name=/^(signInEmail|signInMagicLink|verifyTOTP|verifyBackupCode|verifyPasskeyAuthentication|magicLinkVerify)$/]",
    message:
      "Credential endpoints go through HTTP (auth.handler), where the lockout and limits run; never auth.api.* on the server.",
  },
];
const dbClientRule = {
  name: "@/server/db/client",
  importNames: ["dbAs"],
  message:
    "Data access goes through src/server/repos (withScope/transaction in repos/_base.ts), so every query carries a scope and its RLS settings.",
};
const testOwnerRule = {
  name: "@/server/db/client",
  importNames: ["testOwnerDb"],
  message: "testOwnerDb() bypasses RLS: test fixtures (src/server/testing) and tests only.",
};
const mintRule = {
  name: "@/server/authz/scope",
  importNames: ["mintCustomerScope", "mintShopScope", "mintAdminScope"],
  message:
    "Only src/server/authz mints scopes (via require*). Use requireCustomer/requireShopRole/requireAdminRole.",
};
/**
 * C-12 (SEC-M4): systemScope runs as moz_worker (BYPASSRLS). Allowed only where cross-tenant work belongs:
 * src/server/jobs/** and src/worker/** (relay, sweeps, DLQ), scripts/** (CLI), and these files, each with why:
 *   - src/server/auth/lockout-email.ts: job handler; reads the locked account's address at send time.
 */
const systemScopeRule = {
  name: "@/server/authz/scope",
  importNames: ["systemScope"],
  message:
    "systemScope (BYPASSRLS, worker only) is allowed in src/server/jobs, src/worker, scripts and the eslint.config.mjs allowlist. Requests use require*(); public reads use publicScope().",
};
/** The identity layer's scope (moz_auth). Allowed in src/server/auth, principal.ts and the test-only API. */
const authScopeRule = {
  name: "@/server/authz/scope",
  importNames: ["authScope"],
  message: "authScope belongs to the identity layer (src/server/auth).",
};
const restrictImports = (...paths) => ({
  "no-restricted-imports": paths.length ? ["error", { paths }] : "off",
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    plugins: { moz },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "react/no-danger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "moz/no-server-in-client": "error",
      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"], "type"],
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          pathGroupsExcludedImportTypes: ["builtin"],
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  // ENGINEERING §2: strict, type-aware rules for all TypeScript.
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // Off: async interface implementations (fakes, probes) legitimately return a Promise without awaiting.
      "@typescript-eslint/require-await": "off",
    },
  },
  // ENGINEERING §3: server modules are unreachable from client bundles.
  {
    files: ["src/server/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "src/server/db/schema/**",
      "src/server/db/migrate.ts",
      "src/server/db/reset.ts",
    ],
    rules: { "moz/require-server-only": "error" },
  },
  // Tests may use `!` (ENGINEERING §2) and don't export public APIs.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.ts", "tests/**/*.ts", "scripts/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  // Scoped data access (later blocks override earlier ones for the same files; see the rules above).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      ...restrictImports(dbClientRule, testOwnerRule, mintRule, systemScopeRule, authScopeRule),
      "no-restricted-syntax": ["error", ...scopeCastRules, ...authApiRules],
    },
  },
  {
    files: ["src/server/repos/**/*.ts", "src/server/db/**/*.ts"],
    rules: restrictImports(testOwnerRule, mintRule, systemScopeRule, authScopeRule),
  },
  // Better Auth's adapter and audit writes use the moz_auth pool directly.
  {
    files: ["src/server/auth/**/*.ts"],
    rules: restrictImports(testOwnerRule, mintRule, systemScopeRule),
  },
  { files: ["src/server/auth/lockout-email.ts"], rules: restrictImports(testOwnerRule, mintRule) },
  {
    files: ["src/server/authz/**/*.ts"],
    rules: restrictImports(dbClientRule, testOwnerRule, systemScopeRule, authScopeRule),
  },
  // principal.ts loads the caller's roles to decide (no scope exists yet): identity layer.
  {
    files: ["src/server/authz/principal.ts"],
    rules: restrictImports(dbClientRule, testOwnerRule, systemScopeRule),
  },
  {
    files: ["src/server/jobs/**/*.ts", "src/worker/**/*.ts"],
    rules: restrictImports(dbClientRule, testOwnerRule, mintRule, authScopeRule),
  },
  // Test-only seeding API (404 unless APP_ENV=test): ends a test user's setup sessions.
  {
    files: ["src/app/api/test/**/*.ts"],
    rules: restrictImports(dbClientRule, testOwnerRule, mintRule, systemScopeRule),
  },
  // testing builds fixtures as the owner.
  { files: ["src/server/testing/**/*.ts"], rules: restrictImports() },
  { files: ["src/server/authz/scope.ts"], rules: { "no-restricted-syntax": "off" } },
  // Colours come from tokens only (DESIGN §3); tokens.css is CSS and checked separately.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...hexRules, ...scopeCastRules, ...authApiRules] },
  },
  // The APP_ENV=test seeding API enrols TOTP through auth.api on purpose (it is never served elsewhere).
  {
    files: ["src/app/api/test/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...hexRules, ...scopeCastRules] },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".stryker-tmp/**",
    ".artifacts/**", // screenshots, traces and QA output (git-ignored)
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    ".claude/**",
    "tests/load/**",
  ]),
]);

export default eslintConfig;
