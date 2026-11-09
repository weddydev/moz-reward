import { describe, expect, it } from "vitest";
import { assertExtensionsAvailable, MissingExtensionError } from "./migrate";
import { assertResetAllowed } from "./reset";
import { assertSeedAllowed } from "./seed";

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
