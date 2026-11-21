/**
 * `pnpm sast` (P0-18): Semgrep SAST, SECURITY §10. The one definition used by CI (ci.yml) and by
 * `pnpm gate:task`, so the local twin can't drift from CI (CLAUDE.md: every CI check has a local twin).
 * Runs the pinned image in Docker (the same Docker the integration services need).
 *
 * The files reach the container as one tar stream on stdin, not a bind mount (21 Nov 2026): Docker Desktop's
 * Windows mount made the scan take 20–22 min on the Windows laptop against 33 s on CI. The stream carries
 * exactly what CI scans: the tracked files as they are in the working tree, plus untracked files that aren't
 * git-ignored (new work). Ignored output (node_modules, .next*, .artifacts) never enters, as before.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isDirectRun } from "../src/lib/is-direct-run";

export const SEMGREP_IMAGE =
  "semgrep/semgrep:1.183.0@sha256:2e45517a85e13a9cca14a2a00df6bb48affd66b8ebfae1b0991cd57578362fb0";

export const SEMGREP_SCAN = [
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
] as const;

/** `docker run` reading a tar of the files on stdin into /src, then scanning it. Pure, for tests. */
export const semgrepArgs = (): string[] => [
  "run",
  "--rm",
  "-i",
  "--entrypoint",
  "sh",
  SEMGREP_IMAGE,
  "-c",
  // Fixed text: the scan arguments are the constants above, nothing from the repo or the environment.
  `mkdir -p /src && tar -xf - -C /src && cd /src && exec ${SEMGREP_SCAN.join(" ")}`,
];

/** Pure: the files to scan from `git ls-files` output, without deleted ones (still listed until staged). */
export function scanList(lsFiles: string, exists: (f: string) => boolean): string[] {
  return [...new Set(lsFiles.split("\0").filter(Boolean))].filter((f) => exists(f)).sort();
}

/**
 * Packs `files` (relative to `cwd`) into a tar in memory. The list is NUL-separated and read with `--null`, so
 * a committed file named like an option (`--exclude=*`, `-T`) is packed as a file: with a newline list GNU tar
 * took it as an option and could pack nothing while Semgrep still passed (PD-A security review). The archive
 * must then hold exactly the listed files, or the scan fails rather than run on less.
 */
export function packFiles(files: readonly string[], cwd: string = process.cwd()): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "sast-"));
  try {
    const list = path.join(dir, "files.txt");
    writeFileSync(list, files.map((f) => `${f}\0`).join(""));
    const tar = spawnSync("tar", ["--null", "-cf", "-", "-T", list], {
      cwd,
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (tar.error || tar.status !== 0) {
      // stdout/stderr are null when tar could not be started, whatever the types say.
      const why = tar.error ? tar.error.message : String(tar.stderr).trim();
      throw new Error(`sast: could not pack the files (${why})`);
    }
    const packed = archiveEntries(tar.stdout, cwd);
    if (packed.length !== files.length) {
      throw new Error(
        `sast: could not pack the files (archive holds ${String(packed.length)}, list has ${String(files.length)})`,
      );
    }
    return tar.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The file entries in a tar archive (directories left out). */
export function archiveEntries(archive: Buffer, cwd: string = process.cwd()): string[] {
  const t = spawnSync("tar", ["-tf", "-"], { cwd, input: archive, maxBuffer: 256 * 1024 * 1024 });
  if (t.error || t.status !== 0) throw new Error("sast: could not read the packed archive back");
  return String(t.stdout)
    .split("\n")
    .filter((e) => e !== "" && !e.endsWith("/"));
}

function main(): void {
  const ls = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (ls.status !== 0) {
    console.error(`sast: git ls-files failed: ${ls.stderr}`);
    process.exit(1);
  }
  const files = scanList(ls.stdout, (f) => existsSync(f) && statSync(f).isFile());
  let archive: Buffer;
  try {
    archive = packFiles(files);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  const run = spawnSync("docker", semgrepArgs(), {
    input: archive,
    stdio: ["pipe", "inherit", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) {
    console.error(`sast: could not run Docker (${run.error.message}). Start Docker Desktop.`);
    process.exitCode = 1;
    return;
  }
  console.warn(`[sast] ${String(files.length)} files packed and scanned`);
  process.exitCode = run.status ?? 1;
}

if (isDirectRun(import.meta.url)) main();
