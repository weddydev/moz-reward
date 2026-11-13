import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { migrationUrlFromArgs, readUrlFromStdin } from "./migrate";

const URL_OK = "postgres://moz_owner:S3cret-pass_word.~0123456789@postgres:5432/moz";

const streamOf = (text: string): Readable => Readable.from([Buffer.from(text)]);

describe("[P0-15] migrate --url-stdin (owner URL never in argv, env or a file)", () => {
  it("reads the first line and drops the newline", async () => {
    await expect(readUrlFromStdin(streamOf(`${URL_OK}\n`))).resolves.toBe(URL_OK);
  });

  it("accepts a line without a trailing newline and a CRLF line end", async () => {
    await expect(readUrlFromStdin(streamOf(URL_OK))).resolves.toBe(URL_OK);
    await expect(readUrlFromStdin(streamOf(`${URL_OK}\r\n`))).resolves.toBe(URL_OK);
  });

  it("accepts a URL that arrives in several chunks", async () => {
    const s = new PassThrough();
    const p = readUrlFromStdin(s);
    s.write(URL_OK.slice(0, 10));
    s.write(URL_OK.slice(10));
    s.end("\n");
    await expect(p).resolves.toBe(URL_OK);
  });

  it("accepts postgresql:// too", async () => {
    const u = URL_OK.replace("postgres://", "postgresql://");
    await expect(readUrlFromStdin(streamOf(`${u}\n`))).resolves.toBe(u);
  });

  it.each([
    ["empty input", ""],
    ["a blank line", "\n"],
    ["a non-Postgres scheme", "mysql://u:p@h/db\n"],
    ["text that is not a URL", "postgres://\n"],
    ["more than one line", `${URL_OK}\nsecond line\n`],
    ["an over-long line", `postgres://u:${"x".repeat(5000)}@h/db\n`],
  ])("refuses %s without echoing the input", async (_label, input) => {
    const err = await readUrlFromStdin(streamOf(input)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/--url-stdin/);
    for (const secret of ["S3cret", "mysql", "second line", "xxxx"])
      expect(message).not.toContain(secret);
  });

  it("gives up after the timeout when nothing arrives", async () => {
    const s = new PassThrough();
    await expect(readUrlFromStdin(s, 50)).rejects.toThrow(/no URL on stdin within/);
    s.destroy();
  });
});

describe("[P0-15] migration URL source", () => {
  const env = {
    DATABASE_URL: "postgres://app@h/moz",
    DATABASE_URL_MIGRATIONS: "postgres://mig@h/moz",
    DATABASE_URL_TEST: "postgres://t@h/moz_test",
  };

  it("--url-stdin ignores every environment URL", () => {
    expect(migrationUrlFromArgs(["--url-stdin"], env)).toEqual({ source: "stdin" });
  });

  it("--test uses DATABASE_URL_TEST; the default prefers DATABASE_URL_MIGRATIONS", () => {
    expect(migrationUrlFromArgs(["--test"], env)).toEqual({
      source: "env",
      url: env.DATABASE_URL_TEST,
      test: true,
    });
    expect(migrationUrlFromArgs([], env)).toEqual({
      source: "env",
      url: env.DATABASE_URL_MIGRATIONS,
      test: false,
    });
    expect(migrationUrlFromArgs([], { DATABASE_URL: env.DATABASE_URL })).toEqual({
      source: "env",
      url: env.DATABASE_URL,
      test: false,
    });
  });

  it("refuses --url-stdin with --test, and a missing URL", () => {
    expect(() => migrationUrlFromArgs(["--url-stdin", "--test"], env)).toThrow(/not both/);
    expect(() => migrationUrlFromArgs([], {})).toThrow(/DATABASE_URL is not set/);
    expect(() => migrationUrlFromArgs(["--test"], {})).toThrow(/DATABASE_URL_TEST is not set/);
  });
});
