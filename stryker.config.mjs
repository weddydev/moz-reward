// @ts-check
/**
 * Mutation testing (TESTING §2) for money/rules modules. Add each rules module here as it is built:
 * loyalty engine, plan state machine, offers/Daily Drop limits, announcement caps, referral rules,
 * fraud rules, game score validation. Target ≥ 80%; surviving mutants get a test or a written reason.
 * Run: `pnpm test:mutation` (phase end, for modules touched in the phase).
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mts", related: true },
  plugins: ["@stryker-mutator/vitest-runner"],
  mutate: ["src/server/authz/policies.ts", "src/lib/return-to.ts", "src/lib/codes.ts"],
  coverageAnalysis: "perTest",
  thresholds: { high: 90, low: 80, break: 80 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: ".artifacts/mutation/index.html" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: "always",
  concurrency: 4,
};
export default config;
