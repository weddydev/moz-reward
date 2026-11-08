import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAction } from "./actionTemplate";
import { AppError } from "./errors";

const input = z.object({ shopId: z.string().min(1), name: z.string().min(1).max(10) }).strict();

describe("[P0-07] defineAction", () => {
  it("validates, authorises with parsed input, then calls the handler", async () => {
    const authorize = vi.fn(async ({ shopId }: { shopId: string }) => ({ userId: "u1", shopId }));
    const handler = vi.fn(
      async (i: { name: string }, actor: { userId: string }) => `${actor.userId}:${i.name}`,
    );
    const action = defineAction({ input, authorize, handler });

    await expect(action({ shopId: "s1", name: "Brew" })).resolves.toEqual({
      ok: true,
      data: "u1:Brew",
    });
    expect(authorize).toHaveBeenCalledWith({ shopId: "s1", name: "Brew" });
  });

  it("returns field errors and never authorises or runs the handler on invalid input", async () => {
    const authorize = vi.fn();
    const handler = vi.fn();
    const action = defineAction({ input, authorize, handler });

    const res = await action({ shopId: "s1", name: "", extra: true });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.fieldErrors?.name).toBeDefined();
      expect(res.error.fieldErrors?._).toBeDefined(); // unknown key rejected by .strict()
    }
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not run the handler when authorisation fails", async () => {
    const handler = vi.fn();
    const action = defineAction({
      input,
      authorize: async () => {
        throw new AppError("FORBIDDEN", "You don't have access to this.");
      },
      handler,
    });
    await expect(action({ shopId: "s1", name: "x" })).resolves.toEqual({
      ok: false,
      error: { code: "FORBIDDEN", message: "You don't have access to this." },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("hides unexpected errors behind a friendly message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const action = defineAction({
      input,
      authorize: async () => ({}),
      handler: async () => {
        throw new Error("db password is hunter2");
      },
    });
    const res = await action({ shopId: "s1", name: "x" });
    expect(res).toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong — please try again." },
    });
  });
});
