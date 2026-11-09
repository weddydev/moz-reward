import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isSafeKey } from "./redact";
import { DEFAULT_JOB_OPTIONS, JOBS } from "./registry";

/** Unwraps optional/nullable/default so `z.string().optional()` still counts as a string field. */
function base(schema: z.ZodType): z.ZodType {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    current = current.unwrap() as z.ZodType;
  }
  return current;
}

/** Every free-string field path in a schema (objects and arrays walked). */
function stringFields(schema: z.ZodType, path: string[] = []): string[][] {
  const s = base(schema);
  if (s instanceof z.ZodString) return [path];
  if (s instanceof z.ZodArray) return stringFields(s.element as z.ZodType, path);
  if (s instanceof z.ZodObject) {
    return Object.entries(s.shape as Record<string, z.ZodType>).flatMap(([key, field]) =>
      stringFields(field, [...path, key]),
    );
  }
  return [];
}

describe("[P0-04] job registry", () => {
  it("payloads carry ids only: every free-string field sits under an id/enum key (SECURITY §7)", () => {
    const offenders = Object.entries(JOBS).flatMap(([queue, jobs]) =>
      Object.entries(jobs as Record<string, z.ZodType>).flatMap(([name, schema]) =>
        stringFields(schema)
          .filter((path) => !isSafeKey(path.at(-1) ?? ""))
          .map((path) => `${queue}:${name}.${path.join(".")}`),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("the guard itself catches a payload with personal data", () => {
    const bad = z.object({
      userId: z.string(),
      to: z.string(),
      recipients: z.array(z.string()).optional(),
    });
    expect(stringFields(bad).filter((p) => !isSafeKey(p.at(-1) ?? ""))).toEqual([
      ["to"],
      ["recipients"],
    ]);
  });

  it("defaults to 3 attempts with exponential backoff before a dead letter", () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({ attempts: 3, backoff: { type: "exponential" } });
  });
});
