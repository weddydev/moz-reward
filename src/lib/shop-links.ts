import type { LngLat } from "./geo";

/**
 * Shop page buttons (P1-01, PRODUCT §4): Directions opens Google Maps with the shop's coordinates, Call dials
 * the shop's E.164 number. Both return null when there is nothing valid to link to, and the button is hidden.
 */
const E164 = /^\+[1-9]\d{6,14}$/;

/** Same rule as the `shops_phone_e164` CHECK (drizzle/0015). */
export const isE164 = (phone: string): boolean => E164.test(phone);

export function directionsUrl(location: LngLat | null): string | null {
  if (!location) return null;
  const { lat, lng } = location;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  const round = (n: number): string => String(Math.round(n * 1e6) / 1e6);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", `${round(lat)},${round(lng)}`);
  return url.toString();
}

export function telHref(phone: string | null): string | null {
  return phone !== null && isE164(phone) ? `tel:${phone}` : null;
}
