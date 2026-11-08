import { describe, expect, it } from "vitest";
import { findHits, serverVariableNames } from "./check-client-bundle";

describe("[P0-02] client bundle check", () => {
  it("collects server variable names (including commented examples) and skips NEXT_PUBLIC_*", () => {
    const names = serverVariableNames(
      "A_URL=x\n# E2E_BASE_URL=https://x\nNEXT_PUBLIC_KEY=\n# comment only\nB=1 # c\n",
    );
    expect(names).toEqual(["A_URL", "E2E_BASE_URL", "B"]);
  });

  it("flags a server variable name in a browser file, as a whole word only", () => {
    const files = [
      { file: "a.js", content: "fetch(process.env.DATABASE_URL)" },
      { file: "b.js", content: "MY_DATABASE_URL_X" },
    ];
    expect(findHits(files, ["DATABASE_URL"])).toEqual([{ file: "a.js", name: "DATABASE_URL" }]);
  });

  it("allows only the reviewed Better Auth env-shim getter; any other AUTH_SECRET mention still fails", () => {
    const shim = 'Object.freeze({get AUTH_SECRET(){return F("AUTH_SECRET")}})';
    expect(findHits([{ file: "shim.js", content: shim }], ["AUTH_SECRET"])).toEqual([]);
    const leak = `${shim};console.log(process.env.AUTH_SECRET)`;
    expect(findHits([{ file: "leak.js", content: leak }], ["AUTH_SECRET"])).toHaveLength(1);
  });
});
