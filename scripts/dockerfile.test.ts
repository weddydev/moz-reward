import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P0-15 C2: the runtime image must carry APP_ENV. A build ARG is scoped to its stage, and Next inlines only
 * NEXT_PUBLIC_* values, so an ENV set in the build stage never reached the running containers: the first staging
 * release failed at `db:seed` with "APP_ENV: missing" (15 Nov). scripts/image-check.sh checks the built image too.
 */
const dockerfile = readFileSync(path.resolve(import.meta.dirname, "..", "Dockerfile"), "utf8");

function stage(name: string): string {
  const parts = dockerfile.split(/^FROM /m);
  const found = parts.find((part) => part.split("\n")[0]?.trim().endsWith(` AS ${name}`));
  if (!found) throw new Error(`no stage ${name}`);
  return found;
}

describe("[P0-15] Dockerfile runtime environment", () => {
  it("[P0-15] the runtime stage sets APP_ENV from its own build argument (default production)", () => {
    const runtime = stage("runtime");
    expect(runtime).toMatch(/^ARG APP_ENV=production$/m);
    expect(runtime).toMatch(/^ENV APP_ENV=\$APP_ENV\b/m);
  });
});
