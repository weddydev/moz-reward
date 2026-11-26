"use client";
import { CelebrationHost, requestCelebrationClaim } from "@/features/celebrations/CelebrationHost";
import { REDEMPTION_HINT_EVENT } from "@/features/rewards/hint";
import type { RealtimeEventType } from "@/lib/realtime/events";
import { useRealtime } from "./use-realtime";

const CUSTOMER_EVENTS: ReadonlySet<RealtimeEventType> = new Set([
  "points_credited",
  "reward_unlocked",
  "redemption_confirmed",
  "request_created",
  "request_decided",
  "notification",
]);
const relevant = (type: RealtimeEventType): boolean => CUSTOMER_EVENTS.has(type);

/** P1-15: hints after which there may be an approval to celebrate (a missed one after a reconnect). */
const onHint = (hint: RealtimeEventType | "reconnect"): void => {
  if (hint === "points_credited" || hint === "reward_unlocked" || hint === "reconnect")
    requestCelebrationClaim();
  // P1-16: an open redeem code asks whether it was the one confirmed.
  if (hint === "redemption_confirmed" || hint === "reconnect")
    window.dispatchEvent(new Event(REDEMPTION_HINT_EVENT));
};

/**
 * The signed-in customer's realtime stream (P1-10): keeps the Wallet, Gold Vault and shop pages current
 * without a reload, and (P1-15) asks the celebration host to claim when gold arrives. Renders nothing visible
 * but the moment; the data attributes are for tests and debugging.
 */
export function CustomerRealtime(): React.JSX.Element {
  const { state, events } = useRealtime("/api/sse/me", relevant, onHint);
  return (
    <>
      <span hidden data-testid="realtime" data-realtime={state} data-realtime-events={events} />
      <CelebrationHost />
    </>
  );
}
