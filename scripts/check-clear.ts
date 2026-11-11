/**
 * `pnpm clear:check` — is it safe for the human to `/clear` (or switch laptops) right now?
 * Claude runs it before every "Run `/clear`, then `/resume`" line (CLAUDE.md §1, human's standing rule,
 * 11 Nov 2026) and quotes its verdict. Read-only: it fetches, never commits or pushes.
 *
 * It proves what a fresh session needs to pick up exactly where this one stopped:
 *   1. nothing unsaved locally (clean tree, no stash);
 *   2. the current branch and main are on GitHub (upstream set, nothing ahead);
 *   3. the handoff on origin/main is current: PROGRESS "Last updated" and a SESSION_LOG entry are dated
 *      today, and when work sits on a wip branch, PROGRESS names that branch and its pushed HEAD.
 */
import { spawnSync } from "node:child_process";
import { isDirectRun } from "../src/lib/is-direct-run";

export type ClearFacts = {
  today: string; // YYYY-MM-DD, local
  branch: string;
  dirty: readonly string[]; // `git status --porcelain` lines
  stashes: number;
  upstream: string | null; // e.g. origin/wip/P0-09
  aheadOfUpstream: number;
  mainAheadOfOrigin: number;
  head: string; // short sha of HEAD
  progress: string; // origin/main:progress/PROGRESS.md
  sessionLog: string; // origin/main:progress/SESSION_LOG.md
};

export type Check = { name: string; ok: boolean; detail: string };

export function clearChecks(f: ClearFacts): Check[] {
  const lastUpdated = /^- \*\*Last updated:\*\*(.*)$/m.exec(f.progress)?.[1] ?? "";
  const onWip = f.branch !== "main";
  const checks: Check[] = [
    {
      name: "working tree clean",
      ok: f.dirty.length === 0,
      detail:
        f.dirty.length === 0
          ? ""
          : `${String(f.dirty.length)} changed: ${f.dirty.slice(0, 5).join(", ")}`,
    },
    {
      name: "no stashed work",
      ok: f.stashes === 0,
      detail: f.stashes ? `${String(f.stashes)} stash(es)` : "",
    },
    {
      name: `branch ${f.branch} pushed`,
      ok: f.upstream !== null && f.aheadOfUpstream === 0,
      detail:
        f.upstream === null
          ? "no upstream: push with -u"
          : f.aheadOfUpstream > 0
            ? `${String(f.aheadOfUpstream)} commit(s) not on ${f.upstream}`
            : "",
    },
    {
      name: "main pushed",
      ok: f.mainAheadOfOrigin === 0,
      detail: f.mainAheadOfOrigin
        ? `${String(f.mainAheadOfOrigin)} commit(s) not on origin/main`
        : "",
    },
    {
      name: "PROGRESS on origin/main updated today",
      ok: lastUpdated.includes(f.today),
      detail: lastUpdated.includes(f.today) ? "" : `Last updated:${lastUpdated || " (missing)"}`,
    },
    {
      name: "SESSION_LOG on origin/main has an entry today",
      ok: f.sessionLog.split("\n").some((line) => line.startsWith(`## ${f.today}`)),
      detail: "",
    },
  ];
  if (onWip) {
    checks.push({
      name: `handoff names ${f.branch} and its HEAD ${f.head}`,
      ok: f.progress.includes(f.branch) && f.progress.includes(f.head),
      detail: f.progress.includes(f.branch)
        ? f.progress.includes(f.head)
          ? ""
          : `PROGRESS does not mention ${f.head} (the pushed HEAD)`
        : `PROGRESS does not mention ${f.branch}`,
    });
  }
  return checks;
}

function git(args: string[]): { out: string; ok: boolean } {
  const r = spawnSync("git", args, { encoding: "utf8" });
  return { out: r.stdout.trim(), ok: r.status === 0 };
}

function gatherFacts(): ClearFacts {
  git(["fetch", "--quiet", "origin"]);
  const branch = git(["branch", "--show-current"]).out;
  const upstreamRes = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  const upstream = upstreamRes.ok ? upstreamRes.out : null;
  const count = (range: string) => Number(git(["rev-list", "--count", range]).out || "0");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    today: `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    branch,
    dirty: git(["status", "--porcelain"]).out.split("\n").filter(Boolean),
    stashes: git(["stash", "list"]).out.split("\n").filter(Boolean).length,
    upstream,
    aheadOfUpstream: upstream ? count(`${upstream}..HEAD`) : 0,
    mainAheadOfOrigin: count("origin/main..main"),
    head: git(["rev-parse", "--short=7", "HEAD"]).out,
    progress: git(["show", "origin/main:progress/PROGRESS.md"]).out,
    sessionLog: git(["show", "origin/main:progress/SESSION_LOG.md"]).out,
  };
}

function main(): void {
  const checks = clearChecks(gatherFacts());
  const say = (line: string) => process.stdout.write(`${line}\n`);
  for (const c of checks) {
    say(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  say(
    failed === 0
      ? "[clear:check] SAFE to /clear: everything is saved, pushed and in the handoff."
      : `[clear:check] NOT SAFE to /clear: ${String(failed)} check(s) failed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

if (isDirectRun(import.meta.url)) main();
