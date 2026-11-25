/**
 * Realtime event names (P1-10, ARCHITECTURE §7). Shared by the server (which validates the full payload with
 * zod, src/server/realtime/events.ts) and the browser client (which only needs the name). Events are hints:
 * ids and enums only, never personal data or amounts. The client refetches through the normal authorised
 * reads; the database is the truth.
 */
export const REALTIME_EVENTS = [
  "request_created",
  "request_decided",
  "points_credited",
  "reward_unlocked",
  "redemption_confirmed",
  "notification",
] as const;
export type RealtimeEventType = (typeof REALTIME_EVENTS)[number];

/** Stream control events the server writes itself (never published through Redis). */
export const CONTROL_EVENTS = ["ready", "degraded", "closed", "auth"] as const;
export type ControlEventType = (typeof CONTROL_EVENTS)[number];

export const isRealtimeEvent = (name: string): name is RealtimeEventType =>
  (REALTIME_EVENTS as readonly string[]).includes(name);
export const isControlEvent = (name: string): name is ControlEventType =>
  (CONTROL_EVENTS as readonly string[]).includes(name);

/** Why the server closed a stream (`event: closed`). */
export type CloseReason = "replaced" | "restart" | "signed_out";

/** While realtime is down the client refetches on this interval (ARCHITECTURE §7). */
export const DEGRADED_POLL_MS = 15_000;
/** The server's heartbeat interval; the client treats 2.5× this with no bytes as a dead stream. */
export const HEARTBEAT_MS = 25_000;
