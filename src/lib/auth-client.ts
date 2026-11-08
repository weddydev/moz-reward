import { passkeyClient } from "@better-auth/passkey/client";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser auth client (same origin; /api/auth). */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), twoFactorClient(), passkeyClient()],
});
