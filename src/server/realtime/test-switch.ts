import "server-only";

/**
 * E2E only (APP_ENV=test): the Playwright fixtures send this header (`off`) unless a spec opts in to realtime, so
 * no open stream keeps `networkidle` from settling. A header, not request interception (a Playwright route makes
 * WebKit intercept every request and turns the HTTP cache off: CI 45596050268) and not a cookie (specs clear
 * cookies between roles, which let a stream open and its refresh interrupt the next `goto`: CI 45619492506).
 * Any other APP_ENV ignores it.
 */
export const REALTIME_OFF_HEADER = "x-moz-e2e-realtime";

export function realtimeOffForTest(headerValue: string | null, appEnv: string): boolean {
  return appEnv === "test" && headerValue === "off";
}
