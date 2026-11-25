import "server-only";

/**
 * E2E only (APP_ENV=test): the Playwright fixtures send this cookie (`off`) unless a spec opts in to realtime, so
 * no open stream keeps `networkidle` from settling. A cookie, not request interception: a Playwright route makes
 * WebKit intercept every request and turns the HTTP cache off, which changed every spec's load timing
 * (CI 45596050268). Any other APP_ENV ignores the cookie.
 */
export const REALTIME_OFF_COOKIE = "moz_e2e_realtime";

export function realtimeOffForTest(cookieHeader: string | null, appEnv: string): boolean {
  if (appEnv !== "test") return false;
  return (cookieHeader ?? "").split(";").some((c) => c.trim() === `${REALTIME_OFF_COOKIE}=off`);
}
