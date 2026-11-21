import { describe, expect, it } from "vitest";
import { isAnonymousVolume, selectImages } from "./docker-tidy";

const img = (ref: string, id: string) => {
  const [repo = "", tag = ""] = ref.split(":");
  return { ref, id, size: "1GB", repo, tag };
};

describe("[P0-14] docker:tidy selection", () => {
  const images = [
    img("moz-postgres:walg-test", "a1"), // the tests use it
    img("moz-postgres:local", "a2"), // old own tag
    img("moz-rewards:p0-15-local", "a3"), // old own tag
    img("redis:7-alpine", "b1"), // a container uses it
    img("hashicorp/terraform:1.17.1", "b2"), // third-party, unused
    img("semgrep/semgrep:<none>", "b3"), // dangling: image prune's job
    img("tc-api:local", "c1"), // another project's, a container uses it
  ];
  const used = new Set(["b1", "c1"]);
  const named = new Set(["moz-postgres:walg-test", "redis:7-alpine"]);

  it("[P0-14] by default only this repo's unreferenced moz-* images go", () => {
    expect(selectImages(images, used, named, false).map((i) => i.ref)).toEqual([
      "moz-postgres:local",
      "moz-rewards:p0-15-local",
    ]);
  });

  it("[P0-14] --images adds unused third-party images; never one a container or the repo uses", () => {
    expect(selectImages(images, used, named, true).map((i) => i.ref)).toEqual([
      "moz-postgres:local",
      "moz-rewards:p0-15-local",
      "hashicorp/terraform:1.17.1",
    ]);
  });

  it("[P0-14] only anonymous volumes are ever removed, never named ones", () => {
    expect(
      isAnonymousVolume("04859e52e1e626cffac613ac57268803e5b8b715175d25a1e956b850e73d5fd9"),
    ).toBe(true);
    expect(isAnonymousVolume("moz-rewards_pgdata")).toBe(false);
    expect(isAnonymousVolume("tuitionconnect_pgdata")).toBe(false);
    expect(isAnonymousVolume("moz-trivy-cache")).toBe(false);
  });
});
