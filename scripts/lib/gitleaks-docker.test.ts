import { describe, expect, it } from "vitest";
import { gitleaksDockerArgs } from "./gitleaks-docker";

const IMAGE = "zricethezav/gitleaks:v8.30.1@sha256:abc";

describe("[P0-01] gitleaks pre-commit scan in Docker", () => {
  it("[P0-01] a normal checkout mounts only the repo", () => {
    const args = gitleaksDockerArgs(IMAGE, {
      repo: "/work/moz-reward",
      gitDir: "/work/moz-reward/.git",
      commonDir: "/work/moz-reward/.git",
    });
    expect(args.filter((a) => a === "-v")).toHaveLength(1);
    expect(args).toContain("/work/moz-reward:/repo:ro");
    expect(args).not.toContain("-e");
    expect(args.at(-1)).toMatch(
      /gitleaks git --pre-commit --staged --redact --no-banner -v \/repo$/,
    );
  });

  it("[P0-01] a linked worktree also mounts the main repo's git dir and points GIT_DIR at its entry", () => {
    const args = gitleaksDockerArgs(IMAGE, {
      repo: "/work/moz-PD-04",
      gitDir: "/work/moz-reward/.git/worktrees/moz-PD-04",
      commonDir: "/work/moz-reward/.git",
    });
    expect(args).toContain("/work/moz-PD-04:/repo:ro");
    expect(args).toContain("/work/moz-reward/.git:/gitdir:ro");
    expect(args).toContain("GIT_DIR=/gitdir/worktrees/moz-PD-04");
    expect(args).toContain("GIT_WORK_TREE=/repo");
    expect(args.at(-1)).toContain("safe.directory /gitdir");
  });

  it("[P0-01] Windows paths become a POSIX path inside the container", () => {
    const args = gitleaksDockerArgs(IMAGE, {
      repo: "C:\\work\\moz-PD-04",
      gitDir: "C:\\work\\moz-reward\\.git\\worktrees\\moz-PD-04",
      commonDir: "C:\\work\\moz-reward\\.git",
    });
    expect(args).toContain("GIT_DIR=/gitdir/worktrees/moz-PD-04");
    expect(args).toContain("C:\\work\\moz-reward\\.git:/gitdir:ro");
  });

  it("[P0-01] a git dir outside the common dir is refused, never mounted", () => {
    expect(() =>
      gitleaksDockerArgs(IMAGE, {
        repo: "/work/x",
        gitDir: "/elsewhere/.git",
        commonDir: "/work/moz-reward/.git",
      }),
    ).toThrow(/not inside the common dir/);
  });
});
