import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUTH_ROUTES,
  BLOCKED_AUTH_ROUTES,
  DISABLED_PATHS,
  INTERNAL_AUTH_ROUTES,
  isAllowedAuthRequest,
  reviewGaps,
} from "./routes";

describe("[P0-19] Better Auth route allowlist (deny by default)", () => {
  it("allows reviewed method + path pairs, including :param routes", () => {
    expect(isAllowedAuthRequest("GET", "/get-session")).toBe(true);
    expect(isAllowedAuthRequest("POST", "/sign-in/email")).toBe(true);
    expect(isAllowedAuthRequest("GET", "/callback/google")).toBe(true);
  });

  it("refuses unreviewed paths, wrong methods, blocked :param routes and path tricks", () => {
    expect(isAllowedAuthRequest("POST", "/delete-user")).toBe(false);
    expect(isAllowedAuthRequest("GET", "/reset-password/abc123")).toBe(false);
    expect(isAllowedAuthRequest("DELETE", "/get-session")).toBe(false);
    expect(isAllowedAuthRequest("POST", "/sign-in/email/")).toBe(false);
    expect(isAllowedAuthRequest("GET", "/callback/google/extra")).toBe(false);
    expect(isAllowedAuthRequest("GET", "/callback/")).toBe(false);
    expect(isAllowedAuthRequest("GET", "/../get-session")).toBe(false);
  });

  it("no path is in two categories (allowed, blocked, internal-only)", () => {
    const all = [...ALLOWED_AUTH_ROUTES, ...BLOCKED_AUTH_ROUTES, ...INTERNAL_AUTH_ROUTES].map(
      (r) => r.path,
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("internal-only endpoints are 404 over HTTP but stay enabled in the library (our route calls them)", () => {
    expect(INTERNAL_AUTH_ROUTES.map((r) => r.path)).toEqual(["/magic-link/verify"]);
    for (const { path } of INTERNAL_AUTH_ROUTES) {
      expect(isAllowedAuthRequest("GET", path)).toBe(false);
      expect(isAllowedAuthRequest("POST", path)).toBe(false);
      expect(DISABLED_PATHS).not.toContain(path);
    }
  });

  it("negative fixture: a newly mounted endpoint is reported as unreviewed; a vanished one as stale", () => {
    const mounted = [...ALLOWED_AUTH_ROUTES, ...BLOCKED_AUTH_ROUTES, ...INTERNAL_AUTH_ROUTES].map(
      (r) => r.path,
    );
    expect(reviewGaps(mounted)).toEqual({ unreviewed: [], stale: [] });
    expect(reviewGaps([...mounted, "/new-endpoint-after-upgrade"]).unreviewed).toEqual([
      "/new-endpoint-after-upgrade",
    ]);
    expect(reviewGaps(mounted.filter((p) => p !== "/delete-user")).stale).toEqual(["/delete-user"]);
  });
});
