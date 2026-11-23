import { describe, expect, it } from "vitest";
import {
  containsWord,
  findHits,
  REGISTERED_PROPERTIES,
  serverVariableNames,
  unexpectedRegistrations,
} from "./check-client-bundle";

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

  it("[P0-14] whole-word match at the edges and after a partial occurrence", () => {
    expect(containsWord("KEY", "KEY")).toBe(true);
    expect(containsWord("xKEY KEY", "KEY")).toBe(true);
    expect(containsWord("KEY_2 KEYx", "KEY")).toBe(false);
    expect(containsWord('"KEY"', "KEY")).toBe(true);
    expect(containsWord("anything", "")).toBe(false);
  });

  it("allows only the reviewed Better Auth env-shim getter; any other AUTH_SECRET mention still fails", () => {
    const shim = 'Object.freeze({get AUTH_SECRET(){return F("AUTH_SECRET")}})';
    expect(findHits([{ file: "shim.js", content: shim }], ["AUTH_SECRET"])).toEqual([]);
    const leak = `${shim};console.log(process.env.AUTH_SECRET)`;
    expect(findHits([{ file: "leak.js", content: leak }], ["AUTH_SECRET"])).toHaveLength(1);
  });
});

describe("[PD-07] registered custom properties in the built CSS", () => {
  it("[PD-07] flags an @property the CSS registers that isn't on the reviewed list, once per name", () => {
    const css =
      '@property --tw-blur{syntax:"*";inherits:false}@property --tw-backdrop-blur{syntax:"*";inherits:false}' +
      '@property --tw-backdrop-blur{syntax:"*";inherits:false}.x{--tw-backdrop-sepia:1}';
    expect(unexpectedRegistrations(css, ["--tw-blur"])).toEqual(["--tw-backdrop-blur"]);
    expect(unexpectedRegistrations(css, ["--tw-blur", "--tw-backdrop-blur"])).toEqual([]);
  });

  it("[PD-07] the reviewed list has no backdrop-filter family (a stray word in a source file registered nine, CI 45148036170)", () => {
    expect(REGISTERED_PROPERTIES.filter((n) => n.startsWith("--tw-backdrop-"))).toEqual([]);
    expect(new Set(REGISTERED_PROPERTIES).size).toBe(REGISTERED_PROPERTIES.length);
  });
});
