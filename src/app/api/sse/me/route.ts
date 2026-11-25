import { openRealtimeStream } from "@/server/realtime/route";

export const dynamic = "force-dynamic";

/** P1-10: the signed-in user's realtime stream (ARCHITECTURE §7). Hints only; the client refetches. */
export function GET(request: Request): Promise<Response> {
  return openRealtimeStream(request, { kind: "me" });
}
