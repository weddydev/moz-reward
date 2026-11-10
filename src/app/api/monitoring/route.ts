import { tunnelResponse } from "@/server/observability/tunnel";

/** P0-13: Sentry tunnel for the browser SDK (checks and limits in src/server/observability/tunnel.ts). */
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return tunnelResponse(request);
}
