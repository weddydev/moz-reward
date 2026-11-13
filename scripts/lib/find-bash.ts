import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * A bash ≥ 4 for tests that source the host scripts (`infra/host/*`). The VPS runs Ubuntu's bash 5 and the
 * scripts use bash 4 features (associative arrays), so an older bash would fail them for the wrong reason:
 * macOS ships bash 3.2 (`brew install bash` puts 5.x in /opt/homebrew/bin); Windows needs Git for Windows'
 * bash (System32\bash.exe is WSL, which can't see the repo path).
 */
export function findBash(): string {
  const candidates =
    process.platform === "win32"
      ? [process.env.ProgramFiles, process.env.ProgramW6432, process.env.LOCALAPPDATA]
          .filter((dir): dir is string => Boolean(dir))
          .flatMap((dir) => [
            path.join(dir, "Git", "bin", "bash.exe"),
            path.join(dir, "Programs", "Git", "bin", "bash.exe"),
          ])
          .filter((file) => existsSync(file))
      : [
          ...["/opt/homebrew/bin/bash", "/usr/local/bin/bash"].filter((file) => existsSync(file)),
          "bash",
        ];
  const found = candidates.find((file) => majorVersion(file) >= 4);
  if (!found) {
    throw new Error(
      process.platform === "darwin"
        ? "these tests need bash ≥ 4 (macOS ships 3.2): run `brew install bash`"
        : "these tests need bash ≥ 4 (on Windows: Git for Windows)",
    );
  }
  return found;
}

function majorVersion(file: string): number {
  const result = spawnSync(file, ["-c", "echo ${BASH_VERSINFO[0]}"], { encoding: "utf8" });
  return result.status === 0 ? Number.parseInt(result.stdout.trim(), 10) || 0 : 0;
}
