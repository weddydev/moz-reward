import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./log";

function capture(): {
  stream: Writable;
  lines: () => Record<string, unknown>[];
  raw: () => string;
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const raw = (): string => chunks.join("");
  return {
    stream,
    raw,
    lines: () =>
      raw()
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe("[P0-05] structured logger with redaction", () => {
  it("redacts emails, tokens, phones, codes, passwords, cookies and authorization headers at any depth", () => {
    const out = capture();
    const logger = createLogger({ destination: out.stream, level: "info" });
    logger.info(
      {
        email: "jo@example.co.uk",
        token: "tok_live_123",
        user: { phone: "07700 900123", password: "hunter2hunter2", profile: { email: "x@y.co" } },
        redeem: { code: "K7Q42M" },
        headers: {
          authorization: "Bearer abc.def",
          cookie: "__Host-session=s3cr3t",
          "set-cookie": "a=b",
        },
        shopId: "s-1",
      },
      "sign-in attempt",
    );
    const [line] = out.lines();
    expect(line).toMatchObject({
      msg: "sign-in attempt",
      email: "[redacted]",
      token: "[redacted]",
      user: { phone: "[redacted]", password: "[redacted]", profile: { email: "[redacted]" } },
      redeem: { code: "[redacted]" },
      headers: { authorization: "[redacted]", cookie: "[redacted]", "set-cookie": "[redacted]" },
      shopId: "s-1",
    });
    for (const secret of [
      "jo@example.co.uk",
      "tok_live_123",
      "07700 900123",
      "hunter2",
      "K7Q42M",
      "abc.def",
      "s3cr3t",
      "x@y.co",
    ]) {
      expect(out.raw()).not.toContain(secret);
    }
  });

  it("scrubs emails and phone numbers written into the message text", () => {
    const out = capture();
    createLogger({ destination: out.stream, level: "info" }).warn(
      "email to jo@example.co.uk and SMS to +44 7700 900123 failed",
    );
    expect(out.raw()).not.toContain("jo@example.co.uk");
    expect(out.raw()).not.toContain("7700 900123");
  });

  it("child loggers carry the request id; errors keep type and message", () => {
    const out = capture();
    const child = createLogger({ destination: out.stream, level: "info" }).child({
      requestId: "req-1",
    });
    child.error({ err: new TypeError("boom") }, "failed");
    const [line] = out.lines();
    expect(line).toMatchObject({
      requestId: "req-1",
      msg: "failed",
      err: { type: "TypeError", message: "boom" },
    });
  });

  it("respects the level", () => {
    const out = capture();
    const logger = createLogger({ destination: out.stream, level: "warn" });
    logger.info("hidden");
    logger.warn("shown");
    expect(out.lines().map((l) => l.msg)).toEqual(["shown"]);
  });
});

describe("[P0-07] error objects are scrubbed too (review MEDIUM: DB errors carry values)", () => {
  it("redacts emails in message, stack and nested cause; drops query params and pg detail", () => {
    const out = capture();
    const logger = createLogger({ destination: out.stream, level: "info" });
    const pg = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_key"'),
      {
        code: "23505",
        detail: "Key (email)=(victim@example.com) already exists.",
        where: "SQL statement",
      },
    );
    const drizzle = Object.assign(
      new Error(
        'Failed query: insert into "users" values ($1)\nparams: victim@example.com,s3cr3t-token',
      ),
      {
        query: 'insert into "users" values ($1)',
        params: ["victim@example.com", "s3cr3t-token"],
        cause: pg,
      },
    );

    logger.error({ err: drizzle }, "unexpected error");

    const raw = out.raw();
    expect(raw).not.toContain("victim@example.com");
    expect(raw).not.toContain("s3cr3t-token");
    const [line] = out.lines();
    expect(line).toMatchObject({
      err: { type: "Error", cause: { sqlState: "23505" } },
    });
    expect(JSON.stringify(line)).not.toMatch(/"params"|"detail"/);
  });
});
