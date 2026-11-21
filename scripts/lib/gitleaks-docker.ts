import { posix, win32 } from "node:path";

/**
 * `docker run` arguments for the pre-commit secret scan (scripts/gitleaks-staged.ts). In a linked worktree
 * (`git worktree add`, CLAUDE.md "work beside a gate") the checkout's `.git` is a file pointing into the main
 * repo's `.git/worktrees/<name>`, which a mount of the checkout alone can't reach ("not a git repository").
 * Then the main repo's git folder is mounted too and `GIT_DIR` / `GIT_WORK_TREE` point at the worktree's entry
 * (its `commondir` file is relative, so it resolves inside the mount). Paths are passed in, never guessed.
 */
export function gitleaksDockerArgs(
  image: string,
  at: { repo: string; gitDir: string; commonDir: string },
): string[] {
  const linked = at.gitDir !== at.commonDir;
  // git prints Windows paths with a drive letter; use the matching path rules whatever the host is.
  const path = /^[A-Za-z]:[\\/]/.test(at.commonDir) ? win32 : posix;
  const inner = linked ? path.relative(at.commonDir, at.gitDir).split(/[\\/]/).join("/") : "";
  if (linked && (inner === "" || inner.startsWith("..") || path.isAbsolute(inner))) {
    throw new Error(`git dir ${at.gitDir} is not inside the common dir ${at.commonDir}`);
  }
  // Read-only: the scan only reads the index and objects (PD-A security review LOW).
  const mounts = [
    "-v",
    `${at.repo}:/repo:ro`,
    ...(linked ? ["-v", `${at.commonDir}:/gitdir:ro`] : []),
  ];
  const env = linked ? ["-e", `GIT_DIR=/gitdir/${inner}`, "-e", "GIT_WORK_TREE=/repo"] : [];
  // The mounted repo is owned by another user inside the container; trust it (and its git dir) for git.
  const trust = linked
    ? "git config --global --add safe.directory /repo && git config --global --add safe.directory /gitdir"
    : "git config --global --add safe.directory /repo";
  return [
    "run",
    "--rm",
    ...mounts,
    ...env,
    "-w",
    "/repo",
    "--entrypoint",
    "sh",
    image,
    "-c",
    `${trust} && gitleaks git --pre-commit --staged --redact --no-banner -v /repo`,
  ];
}
