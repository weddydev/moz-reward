import { confirmSignInLink } from "@/server/auth/link-confirm";

/** The confirm page's "Sign in" button posts here; the token is consumed only now (P0-19 AC3). */
export const POST = confirmSignInLink;
