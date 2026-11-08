import { describe, expect, it } from "vitest";
import { assertLngLat, fromWkbHex, toEwkt } from "./geo";

describe("[P0-03] geography points", () => {
  it("writes EWKT with SRID 4326 in lng/lat order", () => {
    expect(toEwkt({ lng: -0.1276, lat: 51.5072 })).toBe("SRID=4326;POINT(-0.1276 51.5072)");
  });

  it("rejects out-of-range or non-finite coordinates before they reach the DB", () => {
    expect(() => {
      assertLngLat({ lng: 181, lat: 0 });
    }).toThrow(/longitude/);
    expect(() => {
      assertLngLat({ lng: 0, lat: -90.5 });
    }).toThrow(/latitude/);
    expect(() => {
      assertLngLat({ lng: Number.NaN, lat: 0 });
    }).toThrow(/longitude/);
  });

  it("parses little-endian EWKB with SRID (Postgres output)", () => {
    // Real PostGIS output of: SELECT 'SRID=4326;POINT(-0.1276 51.5072)'::geography
    const hex = "0101000020E6100000DA1B7C613255C0BFFE43FAEDEBC04940";
    const p = fromWkbHex(hex);
    expect(p.lng).toBeCloseTo(-0.1276, 10);
    expect(p.lat).toBeCloseTo(51.5072, 10);
  });

  it("parses big-endian WKB without SRID", () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(2.5, 5);
    buf.writeDoubleBE(-3.25, 13);
    expect(fromWkbHex(buf.toString("hex"))).toEqual({ lng: 2.5, lat: -3.25 });
  });

  it("refuses non-points, truncated input and junk", () => {
    expect(() => fromWkbHex("0102000000")).toThrow(/not a point/);
    expect(() => fromWkbHex("0101000000")).toThrow(/truncated/);
    expect(() => fromWkbHex("zz")).toThrow(/not a WKB/);
  });
});
