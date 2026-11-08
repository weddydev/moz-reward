import { describe, expect, it } from "vitest";
import { isDirectRun } from "./is-direct-run";

describe("[P0-03] isDirectRun (script entry-point check)", () => {
  it("matches a POSIX path", () => {
    expect(isDirectRun("file:///Users/dev/moz/src/server/db/migrate.ts", "/Users/dev/moz/src/server/db/migrate.ts", "posix")).toBe(true);
  });

  it("matches a Windows path (regression: `pnpm db:migrate` silently did nothing on Windows)", () => {
    expect(isDirectRun("file:///D:/moz/src/server/db/migrate.ts", "D:\\moz\\src\\server\\db\\migrate.ts", "win32")).toBe(true);
  });

  it("does not match when the module is imported by another script", () => {
    expect(isDirectRun("file:///D:/moz/src/server/db/migrate.ts", "D:\\moz\\tests\\e2e\\support\\prepare-server.ts", "win32")).toBe(false);
    expect(isDirectRun("file:///Users/dev/moz/src/server/db/migrate.ts", undefined, "posix")).toBe(false);
  });
});
