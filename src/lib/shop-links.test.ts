import { describe, expect, it } from "vitest";
import { directionsUrl, isE164, telHref } from "./shop-links";

describe("[P1-01] shop link builders", () => {
  it("builds a Google Maps directions URL from coordinates (lat,lng order, 6 decimals)", () => {
    expect(directionsUrl({ lng: -0.1276, lat: 51.5072 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=51.5072%2C-0.1276",
    );
    expect(directionsUrl({ lng: -2.2426305123, lat: 53.4807593456 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=53.480759%2C-2.242631",
    );
  });

  it("returns null with no location or impossible coordinates (the button is hidden)", () => {
    expect(directionsUrl(null)).toBeNull();
    expect(directionsUrl({ lng: 181, lat: 0 })).toBeNull();
    expect(directionsUrl({ lng: 0, lat: Number.NaN })).toBeNull();
  });

  it("builds a tel: link from an E.164 number, and null for anything else", () => {
    expect(telHref("+447700900123")).toBe("tel:+447700900123");
    for (const bad of [
      null,
      "",
      "07700900123",
      "+44 7700 900123",
      "+0447700900123",
      "+4",
      "tel:+447700900123",
    ]) {
      expect(telHref(bad), String(bad)).toBeNull();
    }
  });

  it("isE164 matches the database CHECK on shops.phone", () => {
    expect(isE164("+12025550123")).toBe(true);
    expect(isE164("+1234567890123456")).toBe(false);
  });
});
