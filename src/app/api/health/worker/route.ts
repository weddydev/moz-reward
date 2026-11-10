import { workerResponse } from "@/server/ops/ready";

/** P0-13: the worker's health monitor ticked within 3 min (UptimeRobot). Status only. */
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return workerResponse();
}
