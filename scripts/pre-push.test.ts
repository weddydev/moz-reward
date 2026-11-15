import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changedFiles,
  DOCS_ONLY_GLOBS,
  gateFor,
  needsGate,
  parsePushLines,
  refusal,
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

  it("refuses a force (non-fast-forward) push, on main or any branch", () => {
    expect(refusal(line(A, B), () => false)).toMatch(/non-fast-forward/);
    expect(refusal(line(A, B, "refs/heads/t/P0-14"), () => false)).toMatch(/non-fast-forward/);
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
