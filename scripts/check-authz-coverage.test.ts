import { describe, expect, it } from "vitest";
import {
  exportedEndpoints,
  matrixNames,
  portalPageProblem,
  routePath,
  uncovered,
} from "./check-authz-coverage";

describe("[P0-07] authz coverage script", () => {
  it("finds exported actions, ignoring comments, strings and non-exported ones", () => {
    const src = `
      // export const commented = defineAction({})
      const internal = defineAction({});
      const text = "export const fake = defineAction(";
      export const renameShop = defineAction({ name: "shop.rename" });
      export const helper = makeThing();
    `;
    expect(exportedEndpoints("src/features/shop/actions.ts", src).map((e) => e.name)).toEqual([
      "renameShop",
    ]);
  });

  it("finds route handlers as METHOD + path, whether defineRoute, const or function", () => {
    const src = `
      export const POST = defineRoute({ name: "x" });
      export async function GET(req: Request) { return new Response(); }
      export const dynamic = "force-dynamic";
    `;
    expect(
      exportedEndpoints("src/app/(customer)/api/shops/[id]/route.ts", src).map((e) => e.name),
    ).toEqual(["POST /api/shops/[id]", "GET /api/shops/[id]"]);
  });

  it('in a "use server" file, every export must be a defineAction (plain functions are callable actions)', () => {
    const src = `"use server";
      export const ok = defineAction({ name: "ok" });
      export async function deleteShop(id: string) { return id; }
      export const alsoBad = async () => 1;
      const hidden = defineAction({ name: "h" });
      export { hidden };
      export * from "./other";
    `;
    const found = exportedEndpoints("src/features/shop/actions.ts", src);
    expect(found.filter((e) => !e.problem).map((e) => e.name)).toEqual(["ok"]);
    expect(found.filter((e) => e.problem).map((e) => e.name)).toEqual([
      "deleteShop",
      "alsoBad",
      "hidden",
      "* from ./other",
    ]);
  });

  it('flags inline "use server" functions anywhere (they bypass the template)', () => {
    const src = `export function Page() {
      async function save() { "use server"; await db.delete(); }
      return save;
    }`;
    const found = exportedEndpoints("src/app/x/page.tsx", src);
    expect(found).toEqual([expect.objectContaining({ name: 'inline "use server" in save' })]);
    expect(found[0]?.problem).toMatch(/bypass the action template/);
  });

  it("maps route files to URL paths (route groups dropped)", () => {
    expect(routePath("src/app/api/health/route.ts")).toBe("/api/health");
    expect(routePath("src\\app\\(staff)\\api\\sse\\[shopId]\\route.ts")).toBe("/api/sse/[shopId]");
  });

  it("reads matrix names from authzMatrix calls only", () => {
    const src = `
      authzMatrix("renameShop", { allow: [], run: () => x() });
      authzMatrix('POST /api/uploads', { allow: [], run: () => x() });
      // authzMatrix("commentedOut", {})
      describe("authzMatrix(\\"inString\\"", () => {});
    `;
    expect([...matrixNames(src)].sort()).toEqual(["POST /api/uploads", "renameShop"]);
  });

  it("the repository has no uncovered endpoints", () => {
    expect(uncovered(process.cwd())).toEqual([]);
  });
});

describe("[P0-12] portal pages call their portal's gate with their own path", () => {
  const page = (body: string): string =>
    `export default async function P() { ${body} return null; }`;
  const team = "src/app/(admin)/(pages)/admin/team/page.tsx";

  it("passes a page that awaits its own route's gate; a catch-all gates its portal root", () => {
    expect(
      portalPageProblem(
        "src/app/(shop)/(pages)/dashboard/page.tsx",
        page(`await gateShopRoute("/dashboard");`),
      ),
    ).toBeNull();
    expect(
      portalPageProblem(team, page(`const { scope } = await gateAdminRoute("/admin/team");`)),
    ).toBeNull();
    expect(
      portalPageProblem(
        "src/app/(admin)/admin/[...rest]/page.tsx",
        page(`await gateAdminRoute("/admin");`),
      ),
    ).toBeNull();
    expect(
      portalPageProblem(
        team,
        `async function Team() { await gateAdminRoute("/admin/team"); return null; }\nexport default Team;`,
      ),
    ).toBeNull();
  });

  it("ignores pages and files outside the portal URLs", () => {
    expect(portalPageProblem("src/app/(public)/sign-in/page.tsx", page(""))).toBeNull();
    expect(portalPageProblem("src/app/portal/page.tsx", page(""))).toBeNull();
    expect(
      portalPageProblem("src/app/(shop)/layout.tsx", "export default function L() {}"),
    ).toBeNull();
  });

  it("flags no gate, the wrong gate, another route's path, a nested or un-awaited call, a non-literal", () => {
    expect(portalPageProblem(team, page(""))).toMatch(
      /must `await gateAdminRoute\("\/admin\/team"\)`/,
    );
    expect(portalPageProblem(team, page(`await gateShopRoute("/dashboard");`))).toMatch(
      /calls gateShopRoute/,
    );
    // A page under an owner-only area gating with a broader route of the same portal.
    expect(portalPageProblem(team, page(`await gateAdminRoute("/admin");`))).toMatch(/must `await/);
    expect(
      portalPageProblem(team, page(`if (false) { await gateAdminRoute("/admin/team"); }`)),
    ).toMatch(/must `await/);
    expect(portalPageProblem(team, page(`void gateAdminRoute("/admin/team");`))).toMatch(
      /must `await/,
    );
    expect(portalPageProblem(team, page(`await gateAdminRoute(path);`))).toMatch(/must `await/);
    // A gate named only in a comment or a string doesn't count.
    expect(
      portalPageProblem(
        team,
        `// gateAdminRoute("/admin/team")\nconst s = 'gateAdminRoute("/admin/team")';`,
      ),
    ).toMatch(/must `await/);
  });

  it("flags a portal page that isn't in the table, and a portal URL outside its route group", () => {
    expect(
      portalPageProblem(
        "src/app/(shop)/(pages)/dashboard/staff/invite/page.tsx",
        page(`await gateShopRoute("/dashboard");`),
      ),
    ).toMatch(/not a route of the shop portal/);
    expect(portalPageProblem("src/app/dashboard/extra/page.tsx", page(""))).toMatch(
      /outside the \(shop\) route group/,
    );
    expect(portalPageProblem("src/app/(public)/admin/page.tsx", page(""))).toMatch(
      /outside the \(admin\) route group/,
    );
  });

  it("every page in this repository passes", () => {
    expect(uncovered(process.cwd()).filter((e) => e.name === "portal page")).toEqual([]);
  });
});
