import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CLIENT_ENV_NAMES, formatEnvError, parseClientEnv } from "./env";

describe("[P0-02] client env", () => {
  it("declares NEXT_PUBLIC_* variables only, so nothing server-side can be read through it", () => {
    const names = [...CLIENT_ENV_NAMES];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name).toMatch(/^NEXT_PUBLIC_/);
  });

  it("accepts an empty environment (all public keys are optional) and treats blank as unset", () => {
    expect(parseClientEnv({})).toEqual({ NEXT_PUBLIC_SENTRY_ENABLED: false });
    expect(
      parseClientEnv({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "" }).NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    ).toBeUndefined();
  });

  it("[P0-13] NEXT_PUBLIC_SENTRY_ENABLED is on only for the exact value true", () => {
    expect(parseClientEnv({ NEXT_PUBLIC_SENTRY_ENABLED: "true" }).NEXT_PUBLIC_SENTRY_ENABLED).toBe(
      true,
    );
    expect(parseClientEnv({ NEXT_PUBLIC_SENTRY_ENABLED: "" }).NEXT_PUBLIC_SENTRY_ENABLED).toBe(
      false,
    );
    expect(() => parseClientEnv({ NEXT_PUBLIC_SENTRY_ENABLED: "yes" })).toThrow(
      /NEXT_PUBLIC_SENTRY_ENABLED/,
    );
  });

  it("rejects a server variable passed to the client schema, naming it without its value", () => {
    const run = (): unknown => parseClientEnv({ AUTH_SECRET: "super-secret-value-123" });
    expect(run).toThrow(/AUTH_SECRET|unrecognized/i);
    expect(run).not.toThrow(/super-secret-value-123/);
  });
});

describe("[P1-02] client env without zod in the browser", () => {
  const UUID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

  it("[P1-02] env.ts imports zod as a type only, so no validation library ships to every page", () => {
    const source = readFileSync(path.join(import.meta.dirname, "env.ts"), "utf8");
    const imports = source.match(/^import .*$/gm) ?? [];
    for (const line of imports) expect(line).toMatch(/^import type /);
  });

  it("[P1-02] keeps every rule: Umami path, Umami UUID, blank = unset, values never echoed", () => {
    expect(
      parseClientEnv({ NEXT_PUBLIC_UMAMI_PATH: "/u", NEXT_PUBLIC_UMAMI_WEBSITE_ID: UUID }),
    ).toEqual({
      NEXT_PUBLIC_SENTRY_ENABLED: false,
      NEXT_PUBLIC_UMAMI_PATH: "/u",
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: UUID,
    });
    expect(
      parseClientEnv({ NEXT_PUBLIC_UMAMI_PATH: "", NEXT_PUBLIC_UMAMI_WEBSITE_ID: "" }),
    ).toEqual({ NEXT_PUBLIC_SENTRY_ENABLED: false });
    expect(
      parseClientEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPk" }).NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    ).toBe("BPk");
    for (const bad of ["u", "/U", "/u/x", "https://x.example/u", "/u?x"]) {
      expect(() => parseClientEnv({ NEXT_PUBLIC_UMAMI_PATH: bad }), bad).toThrow(
        /- NEXT_PUBLIC_UMAMI_PATH: must be a same-origin path like \/u/,
      );
    }
    // Version nibble 0 is not a UUID version (RFC 9562), so the second value must fail too.
    for (const bad of ["not-a-uuid-secret", UUID.replace("-4b6c-", "-0b6c-"), `${UUID}x`]) {
      const run = (): unknown => parseClientEnv({ NEXT_PUBLIC_UMAMI_WEBSITE_ID: bad });
      expect(run, bad).toThrow(/- NEXT_PUBLIC_UMAMI_WEBSITE_ID:/);
      expect(run, bad).not.toThrow(bad);
    }
  });

  it("[P1-02] reports every failing variable at once, in the shared format", () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_SENTRY_ENABLED: "yes", NEXT_PUBLIC_UMAMI_PATH: "x" }),
    ).toThrow(
      /^Invalid client environment[^]*- NEXT_PUBLIC_UMAMI_PATH:[^]*- NEXT_PUBLIC_SENTRY_ENABLED:/,
    );
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
