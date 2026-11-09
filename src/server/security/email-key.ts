import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/server/env";

/**
 * Keyed hash of a normalised email address, for Redis keys and counters: lets limits follow an address
 * without writing the address itself anywhere (SECURITY §7).
 */
export const emailKey = (email: string): string =>
  createHmac("sha256", env().AUTH_SECRET)
    .update(email.trim().toLowerCase())
    .digest("base64url")
    .slice(0, 22);
