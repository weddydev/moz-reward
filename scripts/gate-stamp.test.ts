import { describe, expect, it } from "vitest";
import { covers, STAMP_MAX_AGE_MS } from "./lib/gate-stamp";
import { canSkipGate } from "./pre-push";

const NOW = 1_800_000_000_000;

describe("[P0-13] gate pass stamps: the pre-push gate is skipped only for code that already passed", () => {
  it("a stamp covers only the same or fewer task IDs, and only while fresh", () => {
    const stamp = { ids: ["P0-13", "P0-15"], at: NOW - 1000 };
    expect(covers(stamp, ["P0-13"], NOW)).toBe(true);
    expect(covers(stamp, ["P0-13", "P0-15"], NOW)).toBe(true);
    expect(covers(stamp, ["P0-21"], NOW)).toBe(false); // other specs never ran
    expect(covers(stamp, [], NOW)).toBe(false); // no task: the gate itself would fail, never skip
    expect(covers({ ...stamp, at: NOW - STAMP_MAX_AGE_MS - 1 }, ["P0-13"], NOW)).toBe(false);
    expect(covers({ ...stamp, at: NOW + 60_000 }, ["P0-13"], NOW)).toBe(false); // clock skew: don't trust
    expect(covers(null, ["P0-13"], NOW)).toBe(false);
  });

  it("every pushed commit's tree needs a covering stamp; a single unknown tree runs the gate", () => {
    const stamps = new Map([["tree-a", { ids: ["P0-13"], at: NOW }]]);
    const deps = {
      treeOf: (sha: string) => (sha === "sha-a" ? "tree-a" : sha === "sha-b" ? "tree-b" : null),
      stampOf: (tree: string) => stamps.get(tree) ?? null,
      now: NOW,
    };
    expect(canSkipGate([{ sha: "sha-a", ids: ["P0-13"] }], deps)).toBe(true);
    expect(
      canSkipGate(
        [
          { sha: "sha-a", ids: ["P0-13"] },
          { sha: "sha-b", ids: ["P0-13"] },
        ],
        deps,
      ),
    ).toBe(false);
    expect(canSkipGate([{ sha: "sha-x", ids: ["P0-13"] }], deps)).toBe(false);
    expect(canSkipGate([], deps)).toBe(false);
  });
});
