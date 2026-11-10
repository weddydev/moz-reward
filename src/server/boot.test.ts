import { describe, expect, it, vi } from "vitest";
import { bootOrExit } from "./boot";

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
