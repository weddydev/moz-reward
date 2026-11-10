import { describe, expect, it, vi } from "vitest";
import { bootOrExit, redisPairProblem } from "./boot";

describe("[P0-19] boot fails closed (QA-6: invalid env exits instead of serving 500s)", () => {
  it("logs the reason and exits 1 when a check fails", async () => {
    const exit = vi.fn();
    const error = vi.fn();
    await bootOrExit(
      () => {
        throw new Error(
          "Invalid server environment. Fix these variables:\n  - DATABASE_URL: missing",
        );
      },
      { exit, error },
    );
    expect(exit).toHaveBeenCalledWith(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/refusing to start[\s\S]*DATABASE_URL: missing/),
    );
  });

  it("does not exit when every check passes (async checks are awaited)", async () => {
    const exit = vi.fn();
    const check = vi.fn(async () => {});
    await bootOrExit(check, { exit, error: vi.fn() });
    expect(check).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });
});

describe("[P0-18][P0-20] connection budget fits 80% of max_connections (infra/RESOURCES.md)", () => {
  it("production (max 100) and staging (max 80) fit with the per-role pools; staging at the old 60 does not", async () => {
    const { CONNECTION_BUDGET, connectionBudgetProblem } = await import("./boot");
    // (2 web + 1 overlap) × 14 (app 10 + auth 4) + 1 worker × 12 (app 4 + system 8) + reserved.
    expect(connectionBudgetProblem(100, CONNECTION_BUDGET.production)).toBeNull();
    expect(connectionBudgetProblem(80, CONNECTION_BUDGET.staging)).toBeNull();
    expect(connectionBudgetProblem(60, CONNECTION_BUDGET.staging)).toMatch(
      /needs 59 connections but 80% of max_connections \(60\) is 48/,
    );
  });
});

describe("[P0-18] redis-queue / redis-cache pair check (AC3)", () => {
  const queue = { runId: "a1", policy: "noeviction" };
  const cache = { runId: "b2", policy: "allkeys-lru" };
  it("accepts two servers with the right policies", () => {
    expect(redisPairProblem(queue, cache)).toBeNull();
  });
  it.each([
    [{ ...cache, runId: "a1" }, queue, /same Redis server/],
    [cache, { ...queue, policy: "allkeys-lru" }, /queue server evicts/],
    [{ ...cache, policy: "noeviction" }, queue, /cache server never evicts/],
    [{ ...cache, runId: "" }, queue, /identity/],
  ])("refuses %o with queue %o", (c, q, problem) => {
    expect(redisPairProblem(q, c)).toMatch(problem);
  });
});
