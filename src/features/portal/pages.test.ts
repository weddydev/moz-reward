import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_ROOT, PORTAL_ROUTES, type Portal, type PortalRoute } from "./routes";

const APP = join(process.cwd(), "src/app");

/** Where a table route's page lives: in the group's `(pages)`, beside the group's catch-all. */
const pageFile = (r: PortalRoute): string =>
  join(APP, `(${r.portal})`, "(pages)", r.path, "page.tsx");

const GATE: Record<Portal, string> = {
  customer: "gateCustomerRoute",
  shop: "gateShopRoute",
  admin: "gateAdminRoute",
};

function pagesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith("page.tsx"))
    .map((f) => join(dir, f));
}

describe("[P0-12] portal pages on disk match the route table", () => {
  it.each(PORTAL_ROUTES.map((r) => [r.path, r] as const))(
    "%s has a page that calls its gate with its own path",
    (_path, route) => {
      const file = pageFile(route);
      expect(existsSync(file), file).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toContain(`${GATE[route.portal]}("${route.path}")`);
      // A placeholder shows the route's real title (the nav label).
      if (source.includes("PlaceholderPage")) expect(source).toContain(`title="${route.label}"`);
    },
  );

  it.each(["customer", "shop", "admin"] as const)(
    "the %s group has error, not-found and loading files and a gated catch-all",
    (portal) => {
      const group = join(APP, `(${portal})`);
      expect(existsSync(join(group, "error.tsx"))).toBe(true);
      expect(existsSync(join(group, "not-found.tsx"))).toBe(true);
      // `loading.tsx` sits in `(pages)`, so the catch-all beside it answers a real 404.
      expect(existsSync(join(group, "(pages)", "loading.tsx"))).toBe(true);
      const catchAll = join(group, PORTAL_ROOT[portal], "[...rest]", "page.tsx");
      expect(existsSync(catchAll), catchAll).toBe(true);
      expect(readFileSync(catchAll, "utf8")).toContain(`"${PORTAL_ROOT[portal]}"`);
    },
  );

  it("the root has the 403, not-found and error pages", () => {
    for (const f of ["forbidden.tsx", "not-found.tsx", "error.tsx", "global-error.tsx"]) {
      expect(existsSync(join(APP, f)), f).toBe(true);
    }
  });

  it("no portal page renders its own <main> (the shell owns it) or reads error.message", () => {
    const offenders = (["customer", "shop", "admin"] as const)
      .flatMap((p) => pagesUnder(join(APP, `(${p})`)))
      .filter((f) => readFileSync(f, "utf8").includes("<main"));
    expect(offenders).toEqual([]);
    for (const f of ["error.tsx", "global-error.tsx"]) {
      expect(readFileSync(join(APP, f), "utf8"), f).not.toMatch(/error\.message/);
    }
    expect(
      readFileSync(join(process.cwd(), "src/features/portal/RouteError.tsx"), "utf8"),
    ).not.toMatch(/\.message/);
  });
});
