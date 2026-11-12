import "server-only";
import { notFound } from "next/navigation";
import { env } from "@/server/env";

/**
 * What a portal's catch-all page does once its gate has allowed the request (P0-12): a 404.
 *
 * Under `APP_ENV=test` only, `<portal root>/test-error` throws instead, so the E2E suite can prove each
 * group's `error.tsx` on the production build (C-04) and that the thrown text never reaches the page.
 * Staging and production always answer 404 for that path.
 */
export function unknownPortalPath(rest: readonly string[]): never {
  if (env().APP_ENV === "test" && rest.length === 1 && rest[0] === "test-error") {
    throw new Error("Forced portal error (test only): internal-detail-must-not-show");
  }
  notFound();
}
