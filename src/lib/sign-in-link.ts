import { safeReturnTo } from "./return-to";

/**
 * Sign-in link paths and shapes shared by the email, the confirm page and the confirm route (P0-19 AC3).
 * See src/server/auth/link-confirm.ts for the flow.
 */
export const CONFIRM_PAGE_PATH = "/sign-in/confirm";
export const CONFIRM_POST_PATH = "/api/sign-in/confirm";
export const LINK_EXPIRED_PATH = "/sign-in/link-expired";
export const DEFAULT_RETURN = "/wallet";
/** Better Auth's tokens are 32 letters; anything far outside that shape is not worth a database lookup. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

export const isTokenShaped = (token: unknown): token is string =>
  typeof token === "string" && TOKEN_SHAPE.test(token);

/** Confirm-page states the POST can send the user back to (token kept, nothing consumed). */
export type ConfirmRetry = "busy" | "unavailable";

/** The email's link: our confirm page, carrying only the token and a safe return path. */
export function confirmPageUrl(libraryVerifyUrl: string, appUrl: string): string {
  const from = new URL(libraryVerifyUrl);
  const to = new URL(CONFIRM_PAGE_PATH, appUrl);
  to.searchParams.set("token", from.searchParams.get("token") ?? "");
  const returnTo = safeReturnTo(from.searchParams.get("callbackURL"), DEFAULT_RETURN);
  if (returnTo !== DEFAULT_RETURN) to.searchParams.set("returnTo", returnTo);
  return to.toString();
}
