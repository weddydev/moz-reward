/**
 * Pre-commit secret scan of staged changes (P0-01, SECURITY: never commit secrets).
 * Uses a local `gitleaks` if installed, otherwise the pinned Docker image. If neither is available the commit is
 * blocked with instructions: a silent skip would defeat the check.
 */
import { spawnSync } from "node:child_process";

// Same version as CI (.github/workflows/ci.yml), pinned by digest (ENGINEERING §14).
const IMAGE =
  "zricethezav/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f";
// No shell: gitleaks and docker are real executables on every OS. A Windows .cmd shim fails to spawn, and the
// script then falls back to Docker (or blocks the commit), never to a silent skip.
const ok = (cmd: string, args: string[]): boolean =>
  spawnSync(cmd, args, { stdio: "ignore" }).status === 0;

let status: number | null;
if (ok("gitleaks", ["version"])) {
  status = spawnSync(
    "gitleaks",
    ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "-v"],
    {
      stdio: "inherit",
    },
  ).status;
} else if (ok("docker", ["info", "--format", "{{.ServerVersion}}"])) {
  const repo = process.cwd();
  status = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-v",
      `${repo}:/repo`,
      "-w",
      "/repo",
      "--entrypoint",
      "sh",
      IMAGE,
      "-c",
      // The mounted repo is owned by another user inside the container; trust it for git.
      "git config --global --add safe.directory /repo && gitleaks git --pre-commit --staged --redact --no-banner -v /repo",
    ],
    { stdio: "inherit" },
  ).status;
} else {
  console.error(
    "[gitleaks] neither `gitleaks` nor Docker is available. Start Docker Desktop (or install gitleaks) and commit again.",
  );
  status = 1;
}
process.exit(status ?? 1);
