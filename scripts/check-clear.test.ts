import { describe, expect, it } from "vitest";
import { type ClearFacts, clearChecks } from "./check-clear";

const PROGRESS = [
  "Baton: held by talha.syed since 2026-11-11 13:21 IST",
  "- **Last updated:** 2026-11-11 14:20 IST, talha.syed (checkpoint: P0-09 on `wip/P0-09` `a3246f9`)",
].join("\n");
const LOG = "## 2026-11-11 (13:40–14:20 IST) — P0 — step B\nDone: …";

const facts = (over: Partial<ClearFacts> = {}): ClearFacts => ({
  today: "2026-11-11",
  branch: "wip/P0-09",
  dirty: [],
  stashes: 0,
  upstream: "origin/wip/P0-09",
  aheadOfUpstream: 0,
  mainAheadOfOrigin: 0,
  head: "a3246f9",
  progress: PROGRESS,
  sessionLog: LOG,
  ...over,
});
const failing = (f: ClearFacts): string[] =>
  clearChecks(f)
    .filter((c) => !c.ok)
    .map((c) => c.name);

describe("[P0-17] clear:check (safe to /clear)", () => {
  it("passes when everything is saved, pushed and handed off", () => {
    expect(failing(facts())).toEqual([]);
  });
  it.each([
    ["uncommitted files", { dirty: [" M src/a.ts"] }, "working tree clean"],
    ["a stash", { stashes: 1 }, "no stashed work"],
    ["a branch never pushed", { upstream: null }, "branch wip/P0-09 pushed"],
    ["unpushed commits on the branch", { aheadOfUpstream: 2 }, "branch wip/P0-09 pushed"],
    ["unpushed commits on main", { mainAheadOfOrigin: 1 }, "main pushed"],
    ["a stale PROGRESS", { today: "2026-11-12" }, "PROGRESS on origin/main updated today"],
    [
      "no session log entry today",
      { sessionLog: "## 2026-11-10 — old" },
      "SESSION_LOG on origin/main has an entry today",
    ],
    [
      "a handoff that names an older wip commit",
      { head: "b999999" },
      "handoff names wip/P0-09 and its HEAD b999999",
    ],
  ] as const)("fails on %s", (_name, over, check) => {
    expect(failing(facts(over))).toContain(check);
  });
  it("on main, does not ask the handoff to name a wip commit", () => {
    expect(failing(facts({ branch: "main", upstream: "origin/main", head: "zzzzzzz" }))).toEqual(
      [],
    );
  });
});
