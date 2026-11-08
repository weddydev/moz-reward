import { describe, expect, it } from "vitest";
import { z } from "zod";
import { clientEnvSchema, formatEnvError, parseClientEnv } from "./env";

describe("[P0-02] client env", () => {
  it("declares NEXT_PUBLIC_* variables only, so nothing server-side can be read through it", () => {
    const names = Object.keys(clientEnvSchema.shape);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/^NEXT_PUBLIC_/);
  });

  it("accepts an empty environment (all public keys are optional) and treats blank as unset", () => {
    expect(parseClientEnv({})).toEqual({});
    expect(
      parseClientEnv({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" }).NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    ).toBeUndefined();
  });

  it("rejects a server variable passed to the client schema, naming it without its value", () => {
    const run = (): unknown => parseClientEnv({ AUTH_SECRET: "super-secret-value-123" });
    expect(run).toThrow(/AUTH_SECRET|unrecognized/i);
    expect(run).not.toThrow(/super-secret-value-123/);
  });
});

describe("[P0-02] formatEnvError", () => {
  it("lists every failing variable name and rule, never the received values", () => {
    const schema = z.object({ A_URL: z.url(), MODE: z.enum(["x", "y"]), KEY: z.string().min(10) });
    const parsed = schema.safeParse({
      A_URL: "nope-secret-1",
      MODE: "secret-mode-2",
      KEY: "short3",
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const message = formatEnvError("server", parsed.error).message;
    expect(message).toMatch(/^Invalid server environment/);
    for (const name of ["A_URL", "MODE", "KEY"]) expect(message).toContain(`- ${name}:`);
    for (const value of ["nope-secret-1", "secret-mode-2", "short3"])
      expect(message).not.toContain(value);
  });
});
