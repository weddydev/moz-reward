import { z } from "zod";

/**
 * Browser-safe environment (P0-02): `NEXT_PUBLIC_*` variables only. Server variables live in `@/server/env`
 * (server-only), so this module can be imported from client components without pulling server names into the
 * bundle. Each value is read with a literal `process.env.NEXT_PUBLIC_…` so Next inlines it at build time.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const clientEnvSchema = z
  .object({
    /** Cloudflare Turnstile site key (public by design; the secret stays server-side). */
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional,
    /** Web Push VAPID public key (the browser needs it to subscribe; the private key stays server-side). */
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  })
  .strict();

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/** Formats Zod issues as a list of variable NAMES and rules. Values are never included. */
export function formatEnvError(scope: string, error: z.ZodError): Error {
  // Zod 4 messages describe the rule (expected type, allowed options), never the received value; tests pin this.
  const lines = error.issues.map((i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`);
  return new Error(
    `Invalid ${scope} environment. Fix these variables (see .env.example):\n${lines.join("\n")}`,
  );
}

export function parseClientEnv(source: Record<string, string | undefined>): ClientEnv {
  const parsed = clientEnvSchema.safeParse(source);
  if (parsed.success) return parsed.data;
  throw formatEnvError("client", parsed.error);
}

export const clientEnv: ClientEnv = parseClientEnv({
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
});
