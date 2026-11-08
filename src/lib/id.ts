import { v7 } from "uuid";

/** UUIDv7 primary keys (time-ordered, index friendly). ARCHITECTURE §3. */
export const newId = (): string => v7();
