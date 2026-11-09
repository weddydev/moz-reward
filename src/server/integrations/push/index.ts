import "server-only";
import { processState, assertFakeAllowed } from "../fake-support";

export type PushSubscriptionTarget = { endpoint: string; keys?: { p256dh: string; auth: string } };
export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type RecordedPush = { subscription: PushSubscriptionTarget; payload: PushPayload };

export interface PushProvider {
  send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<void>;
}

const recorded = processState<RecordedPush[]>("push", () => []);

/** Fake push sink (TESTING §9): records payloads so tests can assert on them via `/api/test/push`. */
export const fakePushSink = {
  list: (): RecordedPush[] => structuredClone(recorded),
  reset: (): void => {
    recorded.length = 0;
  },
};

const fakeProvider: PushProvider = {
  async send(subscription, payload) {
    recorded.push(structuredClone({ subscription, payload }));
  },
};

/** Real Web Push (VAPID) arrives with the notifications task; until then only the fake exists. */
function resolveProvider(): PushProvider {
  assertFakeAllowed("Push");
  return fakeProvider;
}

export async function sendPush(
  subscription: PushSubscriptionTarget,
  payload: PushPayload,
): Promise<void> {
  await resolveProvider().send(subscription, payload);
}
