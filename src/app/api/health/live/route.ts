import { liveResponse } from "@/server/ops/ready";

/** P0-13: liveness. Public, no detail, no I/O (src/server/ops/ready.ts). */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return liveResponse();
}
