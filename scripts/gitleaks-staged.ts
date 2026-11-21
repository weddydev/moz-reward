/**
 * Pre-commit secret scan of staged changes (P0-01, SECURITY: never commit secrets).
 * Uses a local `gitleaks` if installed, otherwise the pinned Docker image. If neither is available the commit is
 * blocked with instructions: a silent skip would defeat the check.
 */
import { spawnSync } from "node:child_process";
import { gitleaksDockerArgs } from "./lib/gitleaks-docker";

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
  const git = (args: string[]): string => {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  const at = {
    repo: git(["rev-parse", "--show-toplevel"]),
    gitDir: git(["rev-parse", "--absolute-git-dir"]),
    commonDir: git(["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  };
  status = spawnSync("docker", gitleaksDockerArgs(IMAGE, at), { stdio: "inherit" }).status;
} else {
  console.error(
    "[gitleaks] neither `gitleaks` nor Docker is available. Start Docker Desktop (or install gitleaks) and commit again.",
  );
  status = 1;
}
process.exit(status ?? 1);
