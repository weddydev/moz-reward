import "server-only";
import { z } from "zod";
import type { RealtimeEventType } from "@/lib/realtime/events";

/**
 * Typed realtime events (P1-10). Every payload is ids and enums only (strict objects, so an extra field such as
 * a name or an amount is refused, not passed through). Validated when published and again when read back from
 * Redis, so a stream only ever writes a known, small event.
 */
const id = z.uuid();

export const REALTIME_EVENT_SCHEMAS = {
  request_created: z.object({ requestId: id, shopId: id }).strict(),
  request_decided: z
    .object({
      requestId: id,
      shopId: id,
      outcome: z.enum(["approved", "rejected", "expired", "cancelled"]),
    })
    .strict(),
  points_credited: z.object({ shopId: id }).strict(),
  reward_unlocked: z.object({ shopId: id, rewardId: id }).strict(),
  redemption_confirmed: z.object({ shopId: id, redemptionId: id }).strict(),
  /** One new notification (its id), or several at once (no id: the client refetches its list). */
  notification: z.object({ notificationId: id.optional() }).strict(),
} as const satisfies Record<RealtimeEventType, z.ZodType>;

export type RealtimeEventData<T extends RealtimeEventType> = z.output<
  (typeof REALTIME_EVENT_SCHEMAS)[T]
>;

export type RealtimeEvent = {
  [T in RealtimeEventType]: { type: T; data: RealtimeEventData<T> };
}[RealtimeEventType];

/** Largest serialised event; anything bigger is refused (events are hints, not data). */
export const MAX_EVENT_BYTES = 2_048;

const ENVELOPE = z
  .object({
    type: z.enum(
      Object.keys(REALTIME_EVENT_SCHEMAS) as [RealtimeEventType, ...RealtimeEventType[]],
    ),
    data: z.unknown(),
  })
  .strict();

/** The event if `input` is a valid, small event; otherwise null. */
export function parseRealtimeEvent(input: unknown): RealtimeEvent | null {
  const env = ENVELOPE.safeParse(input);
  if (!env.success) return null;
  const data = REALTIME_EVENT_SCHEMAS[env.data.type].safeParse(env.data.data);
  if (!data.success) return null;
  const event = { type: env.data.type, data: data.data } as RealtimeEvent;
  return Buffer.byteLength(JSON.stringify(event), "utf8") <= MAX_EVENT_BYTES ? event : null;
}

/** Channel targets. Ids are uuids (checked) so a channel name can never be steered by input. */
export type RealtimeTarget = { kind: "user"; id: string } | { kind: "shop"; id: string };

export const REALTIME_TARGET = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id }).strict(),
  z.object({ kind: z.literal("shop"), id }).strict(),
]);
