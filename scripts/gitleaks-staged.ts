/**
 * Pre-commit secret scan of staged changes (P0-01, SECURITY: never commit secrets).
 * Uses a local `gitleaks` if installed, otherwise the pinned Docker image. If neither is available the commit is
 * blocked with instructions: a silent skip would defeat the check.
 */
import { spawnSync } from "node:child_process";

const IMAGE = "zricethezav/gitleaks:v8.21.2";
const shell = process.platform === "win32";
const ok = (cmd: string, args: string[]): boolean =>
  spawnSync(cmd, args, { stdio: "ignore", shell }).status === 0;

let status: number | null;
if (ok("gitleaks", ["version"])) {
  status = spawnSync(
    "gitleaks",
    ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "-v"],
    { stdio: "inherit", shell },
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
