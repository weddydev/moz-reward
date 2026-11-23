import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changedFiles,
  ciVerdict,
  DOCS_ONLY_GLOBS,
  gateFor,
  WIP_STEPS,
  needsGate,
  onlyMainUpdates,
  parsePushLines,
  refusal,
  type CiRun,
  type Git,
} from "./pre-push";

const Z = "0".repeat(40);
const A = "a".repeat(40);
const B = "b".repeat(40);
const line = (localSha: string, remoteSha: string, ref = "refs/heads/main") => ({
  localRef: ref,
  localSha,
  remoteRef: ref,
  remoteSha,
});

describe("[P0-14] pre-push guard", () => {
  it("parses git's stdin lines", () => {
    expect(parsePushLines(`refs/heads/main ${A} refs/heads/main ${B}\n\n`)).toEqual([line(A, B)]);
  });

  it("allows a fast-forward push and a new branch", () => {
    expect(refusal(line(A, B), () => true)).toBeNull();
    expect(refusal(line(A, Z, "refs/heads/t/P0-14"), () => false)).toBeNull();
  });

  it("refuses a force (non-fast-forward) push on main and on task branches", () => {
    expect(refusal(line(A, B), () => false)).toMatch(/non-fast-forward/);
    expect(refusal(line(A, B, "refs/heads/t/P0-14"), () => false)).toMatch(/non-fast-forward/);
  });

  it("allows a rewritten wip/* checkpoint branch (rebased onto main with --force-with-lease; process fix 4)", () => {
    expect(refusal(line(A, B, "refs/heads/wip/PD-09"), () => false)).toBeNull();
    // Only the wip/ prefix itself: a look-alike name is still refused.
    expect(refusal(line(A, B, "refs/heads/wipx/PD-09"), () => false)).toMatch(/non-fast-forward/);
    expect(refusal(line(A, B, "refs/heads/main-wip/x"), () => false)).toMatch(/non-fast-forward/);
  });

  it("refuses deleting main but not a task branch", () => {
    expect(refusal(line(Z, B), () => true)).toMatch(/deleting main/);
    expect(refusal(line(Z, B, "refs/heads/t/P0-14"), () => true)).toBeNull();
  });

  it("skips the gate only when every changed file is docs/progress-only", () => {
    expect(needsGate(["docs/PHASES.md", "progress/PROGRESS.md", ".claude/commands/x.md"])).toBe(
      false,
    );
    expect(needsGate(["README.md", "design/reference/a.png"])).toBe(false);
    expect(needsGate(["progress/PROGRESS.md", "src/app/page.tsx"])).toBe(true);
    expect(needsGate(["package.json"])).toBe(true);
    expect(needsGate(["(unknown)"])).toBe(true);
  });

  it("uses exactly the paths CI's path filter ignores (no drift between hook and CI)", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const block = /paths-ignore:\n((?:\s+- .+\n)+)/.exec(ci)?.[1] ?? "";
    const globs = [...block.matchAll(/- "?([^"\n]+)"?/g)].map((m) => m[1]);
    expect(new Set(globs)).toEqual(new Set(DOCS_ONLY_GLOBS));
  });
});

describe("[P0-15] pre-push gate level by target branch (DECISIONS 14 Nov)", () => {
  it("a push only to wip/* branches runs the fast check (CI runs the full set on the push)", () => {
    expect(gateFor([line(A, B, "refs/heads/wip/P0-15")])).toBe("check");
    expect(gateFor([line(A, Z, "refs/heads/wip/P0-15"), line(B, A, "refs/heads/wip/P1-02")])).toBe(
      "check",
    );
  });

  it("main, task branches and anything else keep the full gate:task", () => {
    expect(gateFor([line(A, B)])).toBe("task");
    expect(gateFor([line(A, B, "refs/heads/t/P1-02")])).toBe("task");
    expect(gateFor([line(A, B, "refs/heads/wipe")])).toBe("task");
    expect(gateFor([line(A, B, "refs/heads/wip/P0-15"), line(A, B)])).toBe("task");
  });

  it("deletions don't count; a push with nothing but deletions has no gate level", () => {
    expect(gateFor([line(Z, B, "refs/heads/wip/old"), line(A, B, "refs/heads/wip/P0-15")])).toBe(
      "check",
    );
    expect(gateFor([line(Z, B, "refs/heads/wip/old")])).toBe("check");
    expect(gateFor([line(Z, B, "refs/heads/wip/old"), line(A, B)])).toBe("task");
  });
});

describe("[P0-14] pre-push changed files (never docs-only by accident)", () => {
  const ZERO = "0".repeat(40);
  const line = (remoteSha: string) => ({
    localRef: "refs/heads/x",
    localSha: "a".repeat(40),
    remoteRef: "refs/heads/x",
    remoteSha,
  });
  const fakeGit =
    (answers: Record<string, { ok: boolean; out: string }>): Git =>
    (args) =>
      answers[args[0] ?? ""] ?? { ok: false, out: "" };

  it("a new branch diffs from its merge-base with origin/main", () => {
    const run = fakeGit({
      "merge-base": { ok: true, out: "b".repeat(40) + "\n" },
      diff: { ok: true, out: "docs/a.md\nsrc/x.ts\n" },
    });
    expect(changedFiles(line(ZERO), run)).toEqual(["docs/a.md", "src/x.ts"]);
  });

  it("no origin/main (merge-base fails or is empty) → unknown, so the gate runs", () => {
    const diffWouldBeEmpty = { ok: true, out: "" };
    expect(changedFiles(line(ZERO), fakeGit({ diff: diffWouldBeEmpty }))).toEqual(["(unknown)"]);
    expect(
      changedFiles(
        line(ZERO),
        fakeGit({ "merge-base": { ok: true, out: "\n" }, diff: diffWouldBeEmpty }),
      ),
    ).toEqual(["(unknown)"]);
    expect(needsGate(["(unknown)"])).toBe(true);
  });

  it("a range git can't compute → unknown", () => {
    expect(changedFiles(line("c".repeat(40)), fakeGit({}))).toEqual(["(unknown)"]);
  });
});

describe("[P0-14] lefthook runs the guard on every push", () => {
  it("is a pre-push script with stdin (lefthook skips *commands* when it sees no push files)", () => {
    const config = readFileSync("lefthook.yml", "utf8");
    const prePush = config.slice(config.indexOf("\npre-push:"));
    expect(prePush).toMatch(
      /\n  scripts:\n    "guard-and-gate\.sh":\n      runner: sh\n      use_stdin: true/,
    );
    expect(prePush).not.toMatch(/\n  commands:/);
    expect(readFileSync(".lefthook/pre-push/guard-and-gate.sh", "utf8")).toMatch(
      /exec pnpm exec tsx scripts\/pre-push\.ts/,
    );
  });
});

describe("[P0-14] wip pushes run the cheap checks CI would otherwise catch first (process audit, 21 Nov)", () => {
  it("[P0-14] pnpm check, then Semgrep (3 of 18 red CI runs 14–21 Nov were Semgrep findings on wip pushes)", () => {
    expect(WIP_STEPS).toEqual([["check"], ["sast"]]);
  });
});

describe("[P0-14] main only takes a commit CI has already passed (process change, 22 Nov)", () => {
  const C = "c".repeat(40);
  const run = (headSha: string, status: string, conclusion: string, id = 1): CiRun => ({
    headSha,
    status,
    conclusion,
    databaseId: id,
  });
  // A ← B ← C: B is a parent of C, A of B. `docsOnly(x, y)`: only docs/progress files differ.
  const deps = (docsOnlyPairs: string[] = []) => ({
    isAncestor: (a: string, b: string) => (a === A && (b === B || b === C)) || (a === B && b === C),
    docsOnly: (a: string, b: string) => docsOnlyPairs.includes(`${a}>${b}`),
  });

  it("[P0-14] accepts the exact commit with a green CI run", () => {
    expect(ciVerdict(C, [run(C, "completed", "success")], deps())).toEqual({ ok: true, via: C });
  });

  it("[P0-14] a green rerun after a red attempt counts; cancelled runs never do", () => {
    const runs = [run(C, "completed", "failure", 1), run(C, "completed", "success", 2)];
    expect(ciVerdict(C, runs, deps()).ok).toBe(true);
    const cancelled = ciVerdict(C, [run(C, "completed", "cancelled")], deps());
    expect(cancelled.ok).toBe(false);
  });

  it("[P0-14] any other finished conclusion of its own run (timed out, startup failure…) is red, never covered by an ancestor (PD-A close review M1)", () => {
    for (const c of ["timed_out", "startup_failure", "action_required", "neutral", "stale"]) {
      const v = ciVerdict(
        C,
        [run(C, "completed", c), run(B, "completed", "success")],
        deps([`${B}>${C}`]),
      );
      expect(v.ok, c).toBe(false);
      expect(v.ok ? "" : v.why).toMatch(/red/);
    }
  });

  it("[P0-14] refuses while CI for the commit is still running, and says to carry on meanwhile", () => {
    const v = ciVerdict(C, [run(C, "in_progress", "")], deps());
    expect(v).toMatchObject({ ok: false });
    expect(v.ok ? "" : v.why).toMatch(/still running.*carry on/s);
  });

  it("[P0-14] refuses a commit whose CI is red", () => {
    const v = ciVerdict(C, [run(C, "completed", "failure")], deps());
    expect(v.ok ? "" : v.why).toMatch(/red/);
    // Its own red run wins over a green docs-only ancestor.
    const both = [run(C, "completed", "failure"), run(B, "completed", "success")];
    expect(ciVerdict(C, both, deps([`${B}>${C}`])).ok).toBe(false);
  });

  it("[P0-14] a commit CI skipped (docs/progress only since a green ancestor) rides on that ancestor", () => {
    expect(ciVerdict(C, [run(B, "completed", "success")], deps([`${B}>${C}`]))).toEqual({
      ok: true,
      via: B,
    });
  });

  it("[P0-14] a green ancestor doesn't cover code changed after it, nor does a green non-ancestor", () => {
    expect(ciVerdict(C, [run(B, "completed", "success")], deps()).ok).toBe(false);
    // B is not an ancestor of A, even if only docs differ.
    expect(ciVerdict(A, [run(B, "completed", "success")], deps([`${B}>${A}`])).ok).toBe(false);
  });

  it("[P0-14] no run at all names the way through: push the wip branch, then main once it is green", () => {
    const v = ciVerdict(C, [], deps());
    expect(v.ok ? "" : v.why).toMatch(/wip\/.*green/s);
  });
});

describe("[P0-14] a push to main CI already passed doesn't re-run the gate (process speed, human 23 Nov)", () => {
  const Z0 = "0".repeat(40);
  const l = (remoteRef: string, localSha = "a".repeat(40)) => ({
    localRef: "refs/heads/x",
    localSha,
    remoteRef,
    remoteSha: "b".repeat(40),
  });
  it("[P0-14] only main updates: CI's verdict decides; any other branch in the push still runs its own checks", () => {
    expect(onlyMainUpdates([l("refs/heads/main")])).toBe(true);
    expect(onlyMainUpdates([l("refs/heads/main"), l("refs/heads/wip/PD-09", Z0)])).toBe(true);
    expect(onlyMainUpdates([l("refs/heads/main"), l("refs/heads/wip/PD-09")])).toBe(false);
    expect(onlyMainUpdates([l("refs/heads/wip/PD-09")])).toBe(false);
    expect(onlyMainUpdates([])).toBe(false);
  });
});
