/**
 * Committed pre-push hook (P0-14, ENGINEERING §16; lefthook.yml → `pre-push`). Git passes one line per ref on
 * stdin: `<local ref> <local sha> <remote ref> <remote sha>`.
 *   - Refuses deleting `main` and any non-fast-forward (force) push, to any branch.
 *   - Runs `pnpm gate:task` unless every changed file is docs/progress-only (the same paths CI's path filter
 *     skips — DOCS_ONLY_GLOBS, kept equal to ci.yml by a test).
 * Server-side protection exists only in GITHUB_MODE=pro; in free mode this hook is the guard (it can be
 * bypassed with --no-verify, which the project rules forbid).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveTaskIds, unpushedCommitMessages } from "./gate-task";
import { commitTreeHash, covers, readStamp, type Stamp } from "./lib/gate-stamp";
import { isDirectRun } from "../src/lib/is-direct-run";

export type PushLine = { localRef: string; localSha: string; remoteRef: string; remoteSha: string };

/** Changes that skip build and E2E, here and in CI (`paths-ignore` in .github/workflows/ci.yml). */
export const DOCS_ONLY_GLOBS = ["docs/**", "progress/**", ".claude/**", "design/**", "**/*.md"];

const ZERO = /^0+$/;

export function parsePushLines(stdin: string): PushLine[] {
  return stdin
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p.length === 4)
    .map(([localRef = "", localSha = "", remoteRef = "", remoteSha = ""]) => ({
      localRef,
      localSha,
      remoteRef,
      remoteSha,
    }));
}

/** Why this ref update is refused, or null. `isAncestor(a, b)`: a is an ancestor of b (false if unknown). */
export function refusal(
  line: PushLine,
  isAncestor: (a: string, b: string) => boolean,
): string | null {
  if (ZERO.test(line.localSha)) {
    return line.remoteRef === "refs/heads/main" ? "deleting main is refused" : null;
  }
  if (ZERO.test(line.remoteSha)) return null; // a new branch
  if (!isAncestor(line.remoteSha, line.localSha)) {
    return `non-fast-forward push to ${line.remoteRef} is refused (no force-pushes; pull --rebase first)`;
  }
  return null;
}

/** True when at least one changed file can affect the build or tests. Git prints `/`-separated paths. */
export function needsGate(changedFiles: string[]): boolean {
  return changedFiles.some((f) => !DOCS_ONLY_GLOBS.some((g) => path.posix.matchesGlob(f, g)));
}

/**
 * True when every pushed commit's tree already passed `gate:task` for the same task IDs (scripts/lib/gate-stamp.ts):
 * byte-identical code, so running the gate again would only repeat the same result. Anything unknown → false.
 */
export function canSkipGate(
  pushes: ReadonlyArray<{ sha: string; ids: string[] }>,
  deps: {
    treeOf: (sha: string) => string | null;
    stampOf: (tree: string) => Stamp | null;
    now: number;
  },
): boolean {
  if (pushes.length === 0) return false;
  return pushes.every(({ sha, ids }) => {
    const tree = deps.treeOf(sha);
    return tree !== null && covers(deps.stampOf(tree), ids, deps.now);
  });
}

export type Git = (args: string[]) => { ok: boolean; out: string };

const git: Git = (args) => {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { ok: r.status === 0, out: r.stdout };
};

const isAncestor = (a: string, b: string): boolean =>
  spawnSync("git", ["merge-base", "--is-ancestor", a, b]).status === 0;

/** Files the push changes. Whenever the range can't be computed, "(unknown)" — which always needs the gate. */
export function changedFiles(line: PushLine, run: Git = git): string[] {
  let base = line.remoteSha;
  if (ZERO.test(line.remoteSha)) {
    const mb = run(["merge-base", "origin/main", line.localSha]);
    base = mb.ok ? mb.out.trim() : "";
  }
  // An empty base would turn the range into `..<sha>` (= HEAD..sha), usually empty: never "docs-only" by accident.
  if (base === "") return ["(unknown)"];
  const r = run(["diff", "--name-only", `${base}..${line.localSha}`]);
  return r.ok ? r.out.split("\n").filter(Boolean) : ["(unknown)"];
}

function main(): void {
  const lines = parsePushLines(readFileSync(0, "utf8"));
  for (const line of lines) {
    const why = refusal(line, isAncestor);
    if (why) {
      console.error(`[pre-push] ${why}`);
      process.exit(1);
    }
  }
  const files = lines.filter((l) => !ZERO.test(l.localSha)).flatMap((l) => changedFiles(l));
  if (!needsGate(files)) {
    console.warn(
      files.length === 0
        ? "[pre-push] nothing new to check (branch deletion or no new commits): gate:task skipped"
        : "[pre-push] docs/progress-only push: gate:task skipped (same rule as CI)",
    );
    process.exit(0);
  }
  // The same task IDs the gate would pick when spawned below (unpushed commits, else the next unticked task).
  const { ids } = resolveTaskIds(
    [],
    unpushedCommitMessages(),
    readFileSync(path.join("docs", "PHASES.md"), "utf8"),
  );
  const pushes = lines.filter((l) => !ZERO.test(l.localSha)).map((l) => ({ sha: l.localSha, ids }));
  if (canSkipGate(pushes, { treeOf: commitTreeHash, stampOf: readStamp, now: Date.now() })) {
    console.warn(
      `[pre-push] gate:task already passed for this exact code (tasks ${ids.join(", ")}): not re-run`,
    );
    process.exit(0);
  }
  console.warn("[pre-push] running pnpm gate:task …");
  // Windows needs a shell to run pnpm.cmd; the arguments are constants, so nothing can be injected.
  // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  const r = spawnSync("pnpm", ["gate:task"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  process.exit(r.status ?? 1);
}

if (isDirectRun(import.meta.url)) main();
