import { describe, expect, it } from "vitest";
import { addressLine, areaLine, londonDate, statusLabel, weekRows } from "./view";

describe("[P1-02] landing view helpers", () => {
  it("status line for each open state, with midnight and other-day openings", () => {
    expect(statusLabel({ state: "open", closesAt: "17:30" }, "2026-11-17")).toEqual({
      tone: "open",
      text: "Open · closes 17:30",
    });
    expect(statusLabel({ state: "open", closesAt: "24:00" }, "2026-11-17").text).toBe(
      "Open · closes midnight",
    );
    expect(
      statusLabel({ state: "closes_soon", closesAt: "02:00", minutesLeft: 12 }, "2026-11-17").text,
    ).toBe("Closes soon · 02:00");
    expect(
      statusLabel({ state: "opens_at", opensAt: "09:00", date: "2026-11-17" }, "2026-11-17").text,
    ).toBe("Closed · opens 09:00");
    // 19 Nov 2026 is a Thursday.
    expect(
      statusLabel({ state: "opens_at", opensAt: "09:00", date: "2026-11-19" }, "2026-11-17").text,
    ).toBe("Closed · opens Thu 09:00");
    expect(statusLabel({ state: "closed" }, "2026-11-17")).toEqual({
      tone: "closed",
      text: "Closed",
    });
  });

  it("week rows run Monday first, join split days, and mark missing days closed", () => {
    const rows = weekRows([
      { weekday: 1, opens: "13:00", closes: "17:00" },
      { weekday: 1, opens: "08:00", closes: "11:00" },
      { weekday: 5, opens: "18:00", closes: "02:00" },
      { weekday: 6, opens: "10:00", closes: "24:00" },
    ]);
    expect(rows[0]).toEqual({ day: "Monday", times: "08:00–11:00, 13:00–17:00" });
    expect(rows[1]).toEqual({ day: "Tuesday", times: "Closed" });
    expect(rows[4]).toEqual({ day: "Friday", times: "18:00–02:00" });
    expect(rows[5]).toEqual({ day: "Saturday", times: "10:00–midnight" });
    expect(rows[6]?.day).toBe("Sunday");
    expect(weekRows([]).every((r) => r.times === "Closed")).toBe(true);
  });

  it("area and address lines skip missing parts", () => {
    expect(areaLine("cafe", "Shoreditch")).toBe("Café · Shoreditch");
    expect(areaLine("cafe", null)).toBe("Café");
    expect(areaLine("nail-bar", "Leeds")).toBe("Nail bar · Leeds");
    expect(addressLine(["12 High St", null, " ", "London", "E1 6AN"])).toBe(
      "12 High St, London, E1 6AN",
    );
    expect(addressLine([null, ""])).toBeNull();
  });

  it("London date flips at London midnight, in BST and GMT", () => {
    expect(londonDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(londonDate(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });
});
