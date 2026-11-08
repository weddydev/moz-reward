/**
 * WGS84 points for `geography(Point,4326)` columns (P0-03, ARCHITECTURE §4). Writes use EWKT text, which
 * Postgres casts to geography on insert; reads parse the EWKB hex Postgres returns. Pure, no DB access.
 */
export type LngLat = { lng: number; lat: number };

export function assertLngLat(p: LngLat): void {
  if (!Number.isFinite(p.lng) || p.lng < -180 || p.lng > 180)
    throw new RangeError("longitude must be between -180 and 180");
  if (!Number.isFinite(p.lat) || p.lat < -90 || p.lat > 90)
    throw new RangeError("latitude must be between -90 and 90");
}

export function toEwkt(p: LngLat): string {
  assertLngLat(p);
  return `SRID=4326;POINT(${String(p.lng)} ${String(p.lat)})`;
}

const WKB_POINT = 1;
const EWKB_SRID_FLAG = 0x20000000;

/** Parses a (E)WKB point in hex, as returned by Postgres for geometry/geography columns. */
export function fromWkbHex(hex: string): LngLat {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0)
    throw new TypeError("not a WKB hex string");
  const view = new DataView(Uint8Array.from(Buffer.from(hex, "hex")).buffer);
  const little = view.getUint8(0) === 1;
  const type = view.getUint32(1, little);
  if ((type & 0xff) !== WKB_POINT) throw new TypeError("WKB geometry is not a point");
  const offset = type & EWKB_SRID_FLAG ? 9 : 5;
  if (view.byteLength < offset + 16) throw new TypeError("WKB point is truncated");
  return { lng: view.getFloat64(offset, little), lat: view.getFloat64(offset + 8, little) };
}
