"use client";
import type { RealtimeEventType } from "@/lib/realtime/events";
import { useRealtime } from "./use-realtime";

const CUSTOMER_EVENTS: ReadonlySet<RealtimeEventType> = new Set([
  "points_credited",
  "reward_unlocked",
  "redemption_confirmed",
  "request_decided",
  "notification",
]);
const relevant = (type: RealtimeEventType): boolean => CUSTOMER_EVENTS.has(type);

/**
 * The signed-in customer's realtime stream (P1-10): keeps the Wallet, Gold Vault and shop pages current
 * without a reload. Renders nothing visible; the data attributes are for tests and debugging.
 */
export function CustomerRealtime(): React.JSX.Element {
  const { state, events } = useRealtime("/api/sse/me", relevant);
  return <span hidden data-testid="realtime" data-realtime={state} data-realtime-events={events} />;
}
