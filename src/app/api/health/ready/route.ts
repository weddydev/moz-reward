import { readyResponse } from "@/server/ops/ready";

/** P0-13: readiness for Caddy and deploys (Postgres + redis-queue); detail only with the health token. */
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return readyResponse(request);
}
