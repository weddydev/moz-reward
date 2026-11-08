import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fillSecrets, GENERATED_SECRETS, randomSecret } from "./setup-env";

describe("[P0-02] setup:env", () => {
  it("fills every generated secret in .env.example and keeps the comments", () => {
    const example = readFileSync(".env.example", "utf8");
    const { text, filled } = fillSecrets(example, () => "GENERATED");
    expect(filled.sort()).toEqual([...GENERATED_SECRETS].sort());
    expect(text).toMatch(/^AUTH_SECRET=GENERATED +# 32\+ random bytes/m);
    // Nothing else changes.
    expect(text.split("\n").length).toBe(example.split("\n").length);
    expect(text.replace(/=GENERATED/g, "=")).toBe(example);
  });

  it("leaves a line that already has a value alone", () => {
    expect(fillSecrets("AUTH_SECRET=keep-me\n").filled).toEqual([]);
  });

  it("generates distinct 32-byte base64 secrets that satisfy the 32-character minimum", () => {
    const a = randomSecret();
    expect(Buffer.from(a, "base64")).toHaveLength(32);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(randomSecret()).not.toBe(a);
  });
});
