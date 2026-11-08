import { timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "@/lib/id";

/** UUIDv7 primary key generated in the app (ARCHITECTURE §3). */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => newId());

/** All times are timestamptz (UTC); business rules convert to Europe/London in src/lib/time.ts. */
export const tz = () => timestamp({ withTimezone: true, mode: "date" });

export const timestamps = () => ({
  createdAt: tz().defaultNow().notNull(),
  updatedAt: tz()
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
