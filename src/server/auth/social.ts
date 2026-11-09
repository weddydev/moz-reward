import "server-only";

/**
 * Social sign-in rules (P0-06, SECURITY §2). A Google account whose email Google has not verified must not
 * create a Moz Rewards user: anyone could otherwise claim an address they don't own and, through account
 * linking, reach the real owner's wallet. Better Auth sets `emailVerified` from the provider's
 * `email_verified` claim. Linking an existing user also requires a verified provider email (no trusted
 * providers configured), so one user per verified email holds for Google + magic link (DECISIONS).
 */
export function socialSignUpAllowed(input: {
  path: string | undefined;
  emailVerified: boolean;
}): boolean {
  // Deny by default: only an email link (which proves the address) or internal creation without a request
  // may create an unverified user. Every provider path, present or future, needs a verified email.
  if (input.path === undefined || input.path === "/magic-link/verify") return true;
  return input.emailVerified;
}

/**
 * Google provider options. Better Auth already requests `openid email profile` by default; listing them again
 * duplicated every scope in the authorisation URL, so no `scope` is set here (least data, SECURITY §2).
 */
export function googleProviderOptions(input: { clientId: string; clientSecret: string }): {
  clientId: string;
  clientSecret: string;
  disableIdTokenSignIn: true;
} {
  // No client-submitted ID tokens: that path skips state + PKCE (review P0-B HIGH). Redirect flow only.
  return { clientId: input.clientId, clientSecret: input.clientSecret, disableIdTokenSignIn: true };
}
