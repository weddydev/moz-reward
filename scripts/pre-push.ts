/**
 * Committed pre-push hook (P0-14, ENGINEERING §16; lefthook.yml → `pre-push`). Git passes one line per ref on
 * stdin: `<local ref> <local sha> <remote ref> <remote sha>`.
 *   - Refuses deleting `main` and any non-fast-forward (force) push, to any branch.
 *   - Pushes only to `wip/*` checkpoint branches run the fast `pnpm check`; CI runs the full set on that push and
 *     the task-closing push (main or `t/*`) runs the full gate (DECISIONS 14 Nov 2026, `gateFor`).
 *   - Runs `pnpm gate:task` unless every changed file is docs/progress-only (the same paths CI's path filter
 *     skips — DOCS_ONLY_GLOBS, kept equal to ci.yml by a test).
 *   - A push to main that changes code also needs a green CI run for that exact commit (pushed to its `wip/*`
 *     branch first), or for an ancestor it differs from only in docs/progress files (`ciVerdict`; DECISIONS
 *     22 Nov): CI's runners, all its projects, are the one verdict, so main never goes red from a local pass.
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
 * What a `wip/*` checkpoint push runs: the fast checks plus Semgrep (~20–40 s since the tar stream), so a SAST
 * finding fails here instead of in CI (process audit 21 Nov: 3 of 18 red runs in a week were Semgrep on wip).
 */
export const WIP_STEPS: ReadonlyArray<readonly string[]> = [["check"], ["sast"]];

/**
 * Gate level for a push: "check" when every branch it updates is a `wip/*` checkpoint branch (CI runs the full set on
 * the push; the task-closing push to main or `t/*` runs gate:task), else "task". Deletions don't count.
 */
export function gateFor(lines: PushLine[]): "check" | "task" {
  const updates = lines.filter((l) => !ZERO.test(l.localSha));
  return updates.every((l) => l.remoteRef.startsWith("refs/heads/wip/")) ? "check" : "task";
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

/** One CI workflow run, as `gh run list --json headSha,status,conclusion,databaseId` prints it. */
export type CiRun = { headSha: string; status: string; conclusion: string; databaseId: number };

export type CiVerdict = { ok: true; via: string } | { ok: false; why: string };

/**
 * May main move to `sha`? Yes when CI passed on `sha` itself (any green attempt), or on an ancestor that `sha`
 * differs from only in docs/progress files (CI's path filter skipped `sha` itself, e.g. a merge of main's
 * progress commits). A run still going, a red run or none at all → no, with what to do instead.
 */
export function ciVerdict(
  sha: string,
  runs: readonly CiRun[],
  deps: {
    isAncestor: (a: string, b: string) => boolean;
    docsOnly: (a: string, b: string) => boolean;
  },
): CiVerdict {
  const short = sha.slice(0, 7);
  const own = runs.filter((r) => r.headSha === sha);
  if (own.some((r) => r.status === "completed" && r.conclusion === "success"))
    return { ok: true, via: sha };
  const going = own.find((r) => r.status !== "completed");
  if (going)
    return {
      ok: false,
      why: `CI for ${short} is still running (run ${String(going.databaseId)}): push main once it is green, and carry on with other work meanwhile`,
    };
  if (own.some((r) => r.status === "completed" && r.conclusion === "failure"))
    return { ok: false, why: `CI for ${short} is red: fix it on the wip branch first` };
  const ancestor = runs.find(
    (r) =>
      r.status === "completed" &&
      r.conclusion === "success" &&
      r.headSha !== sha &&
      deps.isAncestor(r.headSha, sha) &&
      deps.docsOnly(r.headSha, sha),
  );
  if (ancestor) return { ok: true, via: ancestor.headSha };
  return {
    ok: false,
    why: `no CI run for ${short}: push it to its wip/ branch first, then push main once that run is green`,
  };
}

/** CI runs for `sha` plus the latest 100 (the candidates for a green ancestor); null when gh can't answer. */
function ciRuns(sha: string): CiRun[] | null {
  const list = (extra: string[]): CiRun[] | null => {
    const r = spawnSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        "ci.yml",
        "--json",
        "headSha,status,conclusion,databaseId",
        ...extra,
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) return null;
    try {
      return JSON.parse(r.stdout) as CiRun[];
    } catch {
      return null;
    }
  };
  const own = list(["--commit", sha, "--limit", "20"]);
  const recent = list(["--status", "success", "--limit", "100"]);
  return own && recent ? [...own, ...recent] : null;
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
  for (const l of lines.filter(
    (x) => x.remoteRef === "refs/heads/main" && !ZERO.test(x.localSha),
  )) {
    const runs = ciRuns(l.localSha);
    if (!runs) {
      console.error(
        "[pre-push] can't read CI status with gh (installed and signed in?): push to main refused",
      );
      process.exit(1);
    }
    const v = ciVerdict(l.localSha, runs, {
      isAncestor,
      docsOnly: (a, b) => !needsGate(changedFiles({ ...l, remoteSha: a, localSha: b })),
    });
    if (!v.ok) {
      console.error(`[pre-push] ${v.why}`);
      process.exit(1);
    }
    console.warn(
      `[pre-push] CI green for ${v.via.slice(0, 7)}${v.via === l.localSha ? "" : " (only docs/progress files changed since)"}`,
    );
  }
  if (gateFor(lines) === "check") {
    console.warn(
      "[pre-push] wip/* checkpoint push: running pnpm check + pnpm sast (CI runs the full set on this push) …",
    );
    for (const args of WIP_STEPS) {
      // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
      const c = spawnSync("pnpm", [...args], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
      if (c.status !== 0) process.exit(c.status ?? 1);
    }
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
