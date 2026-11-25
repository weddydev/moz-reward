import { openRealtimeStream } from "@/server/realtime/route";

export const dynamic = "force-dynamic";

/** P1-10: a shop team's realtime stream (owner or staff of that shop only). Hints only; the client refetches. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/sse/shop/[shopId]">,
): Promise<Response> {
  const { shopId } = await ctx.params;
  return openRealtimeStream(request, { kind: "shop", shopId });
}
