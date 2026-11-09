/**
 * Shared by the Turnstile widget and the server check (P0-05). The bypass token is what the widget sends
 * when no site key is configured (local/test). The server accepts it only in local/test without a secret.
 */
export const TURNSTILE_BYPASS_TOKEN = "local-turnstile-bypass";
/** Form field the widget writes its token into. */
export const TURNSTILE_FIELD = "cf-turnstile-response";
/** Header the sign-in client sends the token in (Better Auth endpoints take JSON, not form fields). */
export const TURNSTILE_HEADER = "x-turnstile-token";
