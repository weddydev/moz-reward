/**
 * `pnpm sast` (P0-18): Semgrep SAST, SECURITY §10. The one definition used by CI (ci.yml) and by
 * `pnpm gate:task`, so the local twin can't drift from CI (CLAUDE.md: every CI check has a local twin).
 * Runs the pinned image in Docker (the same Docker the integration services need).
 */
import { spawnSync } from "node:child_process";

export const SEMGREP_IMAGE =
  "semgrep/semgrep:1.183.0@sha256:2e45517a85e13a9cca14a2a00df6bb48affd66b8ebfae1b0991cd57578362fb0";

export const semgrepArgs = (cwd: string): string[] => [
  "run",
  "--rm",
  "-v",
  `${cwd}:/src`,
  "-w",
  "/src",
  SEMGREP_IMAGE,
  "semgrep",
  "scan",
  "--config",
  "p/default",
  "--config",
  "p/owasp-top-ten",
  "--config",
  "p/secrets",
  "--metrics=off",
  "--error",
  "--quiet",
  "--exclude",
  "node_modules",
  "--exclude",
  ".next",
  "--exclude",
  ".next-e2e",
  "--exclude",
  ".artifacts",
];

const run = spawnSync("docker", semgrepArgs(process.cwd()), { stdio: "inherit" });
if (run.error) {
  console.error(`sast: could not run Docker (${run.error.message}). Start Docker Desktop.`);
  process.exit(1);
}
process.exit(run.status ?? 1);
