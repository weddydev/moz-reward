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
  // Tests may use `!` (ENGINEERING §2) and don't export public APIs.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.ts", "tests/**/*.ts", "scripts/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },
  // Colours come from tokens only (DESIGN §3); tokens.css is CSS and checked separately.
  {
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=/${HEX_COLOUR}/]`, message: hexMessage },
        { selector: `TemplateElement[value.raw=/${HEX_COLOUR}/]`, message: hexMessage },
        { selector: `JSXText[value=/${HEX_COLOUR}/]`, message: hexMessage },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    ".stryker-tmp/**",
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
