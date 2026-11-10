import "server-only";
import { log } from "@/server/log";
import { reportUnexpected } from "./sentry";

/** Next's `onRequestError` (src/instrumentation.ts): log with the request id, then Sentry + developer alert. */
export function reportRequestError(
  err: unknown,
  headers: Record<string, string | string[] | undefined>,
  routePath: string,
  routeType: string,
): void {
  const raw = headers["x-request-id"];
  const requestId = (Array.isArray(raw) ? raw[0] : raw) ?? undefined;
  const digest =
    typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  log().error({ err, requestId, route: routePath, routeType, digest }, "request error");
  reportUnexpected(err, {
    where: `${routeType} ${routePath}`,
    ...(requestId ? { requestId } : {}),
  });
}
