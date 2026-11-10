import { describe, expect, it, vi } from "vitest";
import { assertExtensionsAvailable, MissingExtensionError } from "./migrate";
import { assertResetAllowed } from "./reset";
import { assertNoPasswordOnlyStaff, assertSeedAllowed } from "./seed";

const LOCAL = "postgres://moz:moz@localhost:5432/moz";

describe("[P0-03] db:reset guard (never touches a remote or non-local database)", () => {
  it.each(["staging", "production", "test", undefined])("refuses APP_ENV=%s", (appEnv) => {
    expect(() => assertResetAllowed(appEnv, LOCAL)).toThrow(/APP_ENV=local/);
  });

  it.each([
    "postgres://u:p@ep-cool-123.eu-west-2.aws.neon.tech/neondb",
    "postgres://u:p@localhost.evil.example/moz", // lookalike host
    "postgres://u:p@10.0.0.5:5432/moz", // private network is still not this machine
    "postgres://u:p@localhost,db.remote.example/moz", // multi-host
    "not a url",
  ])("refuses a database that is not on this machine: %s", (url) => {
    expect(() => assertResetAllowed("local", url)).toThrow(/localhost/);
  });

  it("refuses when no database URL is set", () => {
    expect(() => assertResetAllowed("local", undefined)).toThrow(/not set/);
    expect(() => assertResetAllowed("local", "")).toThrow(/not set/);
  });

  it.each([LOCAL, "postgres://moz:moz@127.0.0.1:5432/moz", "postgres://moz:moz@[::1]:5432/moz"])(
    "allows a local database: %s",
    (url) => {
      expect(assertResetAllowed("local", url)).toBe(url);
    },
  );
});

describe("[P0-03] db:seed guard", () => {
  it("refuses production", () => {
    expect(() => {
      assertSeedAllowed("production");
    }).toThrow(/never runs in production/);
  });

  it.each(["local", "test", "staging"])("allows %s", (appEnv) => {
    expect(() => {
      assertSeedAllowed(appEnv);
    }).not.toThrow();
  });
});

describe("[P0-16] db:seed refuses to leave a password-only staff account on staging (C-07)", () => {
  it("passes when every staff/admin account has two-step verification", () => {
    expect(() => {
      assertNoPasswordOnlyStaff("staging", []);
    }).not.toThrow();
  });

  it("fails on staging, naming the accounts", () => {
    expect(() => {
      assertNoPasswordOnlyStaff("staging", ["a@test.moz.invalid", "b@test.moz.invalid"]);
    }).toThrow(/2 staff\/admin account\(s\).*a@test\.moz\.invalid, b@test\.moz\.invalid/);
  });

  it("only warns locally (developers create throwaway accounts)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => {
      assertNoPasswordOnlyStaff("local", ["a@test.moz.invalid"]);
    }).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("a@test.moz.invalid"));
    warn.mockRestore();
  });
});

describe("[P0-03] PostGIS pre-check before migrating", () => {
  it("names every missing extension and how to fix it", async () => {
    const err = await assertExtensionsAvailable(async () => false).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MissingExtensionError);
    expect((err as Error).message).toMatch(/postgis/);
    expect((err as Error).message).toMatch(/pnpm services:up/);
  });

  it("passes when the extensions are available", async () => {
    await expect(assertExtensionsAvailable(async () => true)).resolves.toBeUndefined();
  });
});
