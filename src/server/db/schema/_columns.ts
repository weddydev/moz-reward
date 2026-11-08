/* eslint-disable @typescript-eslint/explicit-module-boundary-types -- Drizzle column builders: the inferred builder generics ARE the API (spelling them out is brittle and adds nothing). */
import { customType, timestamp, uuid } from "drizzle-orm/pg-core";
import { fromWkbHex, type LngLat, toEwkt } from "@/lib/geo";
import { newId } from "@/lib/id";

/** UUIDv7 primary key generated in the app (ARCHITECTURE §3). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => newId());

/** All times are timestamptz (UTC); business rules convert to Europe/London in src/lib/time.ts. */
export const tz = () => timestamp({ withTimezone: true, mode: "date" });

/**
 * created_at / updated_at. The DB trigger `set_updated_at()` (migration 0003) is the source of truth for
 * updated_at, so raw SQL and other clients are covered too; `$onUpdate` only keeps the returned row current.
 */
export const timestamps = () => ({
  createdAt: tz().defaultNow().notNull(),
  updatedAt: tz()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * PostGIS `geography(Point,4326)`: distances in metres on the spheroid (P0-03). Values are `{ lng, lat }`.
 * Writes send EWKT (validated ranges); reads parse the EWKB hex Postgres returns.
 */
export const geographyPoint = customType<{ data: LngLat; driverData: string }>({
  dataType: () => "geography(Point,4326)",
  toDriver: (value) => toEwkt(value),
  fromDriver: (value) => fromWkbHex(value),
});
