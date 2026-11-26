"use client";
import type { RealtimeEventType } from "@/lib/realtime/events";
import { useRealtime } from "./use-realtime";

const SHOP_EVENTS: ReadonlySet<RealtimeEventType> = new Set(["request_created", "request_decided"]);
const relevant = (type: RealtimeEventType): boolean => SHOP_EVENTS.has(type);

/**
 * The shop team's realtime stream (P1-10, P1-12): a request arriving or decided elsewhere (another team member,
 * the owner, the member cancelling, the expiry job) refreshes the page (the Requests queue, the owner's Requests nav count) without a reload; mounted by the shop layout. Hints only;
 * the page re-reads through its own gate. Renders nothing visible; the data attributes are for tests.
 */
export function ShopRealtime({ shopId }: { shopId: string }): React.JSX.Element {
  const { state, events } = useRealtime(`/api/sse/shop/${encodeURIComponent(shopId)}`, relevant);
  return (
    <span hidden data-testid="shop-realtime" data-realtime={state} data-realtime-events={events} />
  );
}
