import { describe, expect, it } from "vitest";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { parseRealtimeEvent, REALTIME_EVENT_SCHEMAS } from "./events";

const A = "0190a8f0-0000-7000-8000-000000000001";
const B = "0190a8f0-0000-7000-8000-000000000002";

describe("[P1-10] realtime event schema", () => {
  it("covers exactly the event names the client knows", () => {
    expect(Object.keys(REALTIME_EVENT_SCHEMAS).sort()).toEqual([...REALTIME_EVENTS].sort());
  });

  it("accepts ids-only payloads", () => {
    expect(parseRealtimeEvent({ type: "points_credited", data: { shopId: A } })).toEqual({
      type: "points_credited",
      data: { shopId: A },
    });
    expect(
      parseRealtimeEvent({
        type: "request_decided",
        data: { requestId: A, shopId: B, outcome: "approved" },
      }),
    ).not.toBeNull();
  });

  it("refuses extra fields (no names, amounts or emails ride along), bad ids and unknown types", () => {
    expect(
      parseRealtimeEvent({ type: "points_credited", data: { shopId: A, points: 40 } }),
    ).toBeNull();
    expect(
      parseRealtimeEvent({ type: "notification", data: { notificationId: A, email: "a@b.co" } }),
    ).toBeNull();
    expect(parseRealtimeEvent({ type: "points_credited", data: { shopId: "shop-1" } })).toBeNull();
    expect(parseRealtimeEvent({ type: "ready", data: {} })).toBeNull();
    expect(
      parseRealtimeEvent({ type: "notification", data: { notificationId: A }, x: 1 }),
    ).toBeNull();
    expect(parseRealtimeEvent("not an object")).toBeNull();
  });
});
