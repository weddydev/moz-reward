import { describe, expect, it } from "vitest";
import { pnpmInvocation } from "./lib/gate";
import { scanList, SEMGREP_IMAGE, semgrepArgs } from "./sast";

describe("[P0-18] sast over a tar stream", () => {
  it("[P0-18] scans tracked + new files as they exist, once each, sorted; deleted files are left out", () => {
    const ls = ["src/b.ts", "src/a.ts", "gone.ts", "src/a.ts", "new.ts", ""].join("\0");
    expect(scanList(ls, (f) => f !== "gone.ts")).toEqual(["new.ts", "src/a.ts", "src/b.ts"]);
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
});
