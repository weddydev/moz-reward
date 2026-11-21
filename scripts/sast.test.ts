import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pnpmInvocation } from "./lib/gate";
import { archiveEntries, packFiles, scanList, SEMGREP_IMAGE, semgrepArgs } from "./sast";

describe("[P0-18] sast over a tar stream", () => {
  it("[P0-18] scans tracked + new files as they exist, once each, sorted; deleted files are left out", () => {
    const ls = ["src/b.ts", "src/a.ts", "gone.ts", "src/a.ts", "new.ts", ""].join("\0");
    expect(scanList(ls, (f) => f !== "gone.ts")).toEqual(["new.ts", "src/a.ts", "src/b.ts"]);
  });

  it("[P0-18] a committed file named like a tar option is packed as a file, never read as an option", () => {
    // PD-A security review MEDIUM: with a newline list, GNU tar took `--exclude=*` as an option and packed
    // nothing, so Semgrep scanned an empty tree and passed.
    const dir = mkdtempSync(path.join(tmpdir(), "sast-test-"));
    try {
      mkdirSync(path.join(dir, "src"));
      // `--exclude=src`, not `--exclude=*`: `*` can't be in a Windows file name. Read as an option it drops
      // every src/ entry and itself, so the check below fails just as it did for `*`.
      const files = ["--exclude=src", "-T", "src/a.ts", "src/b c.ts"];
      for (const f of files) writeFileSync(path.join(dir, f), "export {};\n");
      const archive = packFiles(files, dir);
      expect(archiveEntries(archive, dir).sort()).toEqual([...files].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[P0-18] packing fails loudly when the archive does not hold every listed file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sast-test-"));
    try {
      writeFileSync(path.join(dir, "a.ts"), "export {};\n");
      expect(() => packFiles(["a.ts", "missing.ts"], dir)).toThrow(/could not pack/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[P0-18] the pinned image reads the files from stdin into /src and keeps the same rules", () => {
    const args = semgrepArgs();
    expect(args.slice(0, 3)).toEqual(["run", "--rm", "-i"]);
    expect(args).toContain(SEMGREP_IMAGE);
    expect(args).not.toContain("-v"); // no bind mount
    const script = args.at(-1) ?? "";
    expect(script).toMatch(
      /^mkdir -p \/src && tar -xf - -C \/src && cd \/src && exec semgrep scan /,
    );
    for (const rule of ["p/default", "p/owasp-top-ten", "p/secrets"])
      expect(script).toContain(rule);
    expect(script).toContain("--error");
  });
});

describe("[P0-14] pnpm without a shell", () => {
  it("[P0-14] runs pnpm's JS entry under node when pnpm started us; otherwise falls back to pnpm", () => {
    const viaPnpm = pnpmInvocation(["exec", "vitest"], {
      npm_execpath: "C:\\pnpm\\bin\\pnpm.cjs",
    });
    expect(viaPnpm).toEqual({
      cmd: process.execPath,
      args: ["C:\\pnpm\\bin\\pnpm.cjs", "exec", "vitest"],
      shell: false,
    });
    const npm = pnpmInvocation(["x"], { npm_execpath: "/usr/lib/node_modules/npm/bin/npm-cli.js" });
    expect(npm.cmd).toBe("pnpm");
    expect(pnpmInvocation(["x"], {}).cmd).toBe("pnpm");
  });

  it("[P0-14] runs pnpm's native binary (pnpm 12 ships pnpm.exe) directly, so `|` in an argument is never a pipe", () => {
    const exe = "C:\\Users\\dev\\AppData\\Local\\pnpm\\node_modules\\pnpm\\pnpm.exe";
    expect(pnpmInvocation(["e2e", "-g", "a|b"], { npm_execpath: exe })).toEqual({
      cmd: exe,
      args: ["e2e", "-g", "a|b"],
      shell: false,
    });
    const posix = "/home/dev/.local/share/pnpm/pnpm";
    expect(pnpmInvocation(["x"], { npm_execpath: posix })).toEqual({
      cmd: posix,
      args: ["x"],
      shell: false,
    });
  });
});
