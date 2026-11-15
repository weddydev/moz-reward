import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * A bash ≥ 4 for tests that source the host scripts (`infra/host/*`). The VPS runs Ubuntu's bash 5 and the
 * scripts use bash 4 features (associative arrays), so an older bash would fail them for the wrong reason:
 * macOS ships bash 3.2 (`brew install bash` puts 5.x in /opt/homebrew/bin); Windows needs Git for Windows'
 * bash (System32\bash.exe is WSL, which can't see the repo path).
 *
 * On macOS it also puts GNU coreutils, GNU sed and OpenSSL 3 first on this process's PATH (spawned shells
 * inherit it), because the host scripts and their fakes rely on what Ubuntu has: `touch -d "6 days ago"`,
 * `stat -c`, `head -n 0`, `sed -i`, Ed25519 in `openssl genpkey`. BSD tools and LibreSSL would fail those
 * tests for the wrong reason (15 Nov 2026).
 */
export function findBash(): string {
  if (process.platform === "darwin") preferGnuToolsOnMac();
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

const MAC_HOST_TOOLS = [
  ["coreutils", "libexec/gnubin"],
  ["gnu-sed", "libexec/gnubin"],
  ["openssl@3", "bin"],
] as const;

function preferGnuToolsOnMac(): void {
  const prefixes = ["/opt/homebrew/opt", "/usr/local/opt"];
  const dirs = MAC_HOST_TOOLS.map(([formula, sub]) =>
    prefixes.map((prefix) => path.join(prefix, formula, sub)).find((dir) => existsSync(dir)),
  );
  const missing = MAC_HOST_TOOLS.filter((_, i) => !dirs[i]).map(([formula]) => formula);
  if (missing.length > 0) {
    throw new Error(
      `these tests need the host's GNU tools on macOS: run \`brew install ${missing.join(" ")}\``,
    );
  }
  const current = (process.env.PATH ?? "").split(path.delimiter);
  const add = (dirs as string[]).filter((dir) => !current.includes(dir));
  if (add.length > 0) process.env.PATH = [...add, ...current].join(path.delimiter);
}
