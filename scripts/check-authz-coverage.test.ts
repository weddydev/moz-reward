import { describe, expect, it } from "vitest";
import { exportedEndpoints, matrixNames, routePath, uncovered } from "./check-authz-coverage";

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
