import { describe, expect, it } from "vitest";
import { untaggedTests } from "./check-test-titles";

describe("[P0-17] test title checker", () => {
  it("accepts tags on the test or on any enclosing describe", () => {
    const src = `
      describe("[P0-06] auth", () => { it("signs in", () => {}); });
      test("[J2][P1-12] approves", async () => {});
      describe("outer", () => { describe("[S-03] inner", () => { it.each([1])("case %s", () => {}); }); });
      test.describe("[P0-17] guard", () => { test("passes", async () => {}); });`;
    expect(untaggedTests("a.test.ts", src)).toEqual([]);
  });

  it("reports untagged tests with file and line", () => {
    const src = `describe("auth", () => {\n  it("signs in", () => {});\n});\ntest.skip("todo later", () => {});`;
    expect(untaggedTests("b.test.ts", src)).toEqual([
      "b.test.ts:2  signs in",
      "b.test.ts:4  todo later",
    ]);
  });

  it("ignores hooks and configuration calls", () => {
    const src = `test.beforeEach(() => {}); test.use({ guardAllow: [] }); describe("[P0-01] x", () => { it("y", () => {}); });`;
    expect(untaggedTests("c.spec.ts", src)).toEqual([]);
  });
});
