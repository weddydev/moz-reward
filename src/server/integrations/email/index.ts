import { env } from "@/server/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Short label for logs, e.g. "magic-link". Never log the body: it can contain sign-in tokens. */
  kind: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// Kept on globalThis so the dev outbox survives Next.js hot reloads.
const g = globalThis as unknown as { __mozOutbox?: EmailMessage[] };
const outbox: EmailMessage[] = (g.__mozOutbox ??= []);
const OUTBOX_LIMIT = 50;

/** Local provider: prints the email to the terminal and keeps it for the dev-only outbox (E2E). */
export const consoleProvider: EmailProvider = {
  async send(message) {
    outbox.push(message);
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
    console.warn(
      `\n[email:${message.kind}] to=${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
    );
  },
};

/** Messages captured by the console/memory providers (local + test only). */
export const devOutbox = (): ReadonlyArray<EmailMessage> => outbox;

/** Test provider: keeps messages in memory for assertions. */
export const memoryProvider: EmailProvider & { outbox: EmailMessage[]; clear(): void } = {
  outbox,
  clear: () => void outbox.splice(0, outbox.length),
  async send(message) {
    outbox.push(message);
  },
};

function resolveProvider(): EmailProvider {
  const e = env();
  if (e.APP_ENV === "test") return memoryProvider;
  switch (e.EMAIL_PROVIDER) {
    case "console":
      return consoleProvider;
    case "resend":
    case "brevo":
      // Real providers are wired once H-04 is done (P0 auth task follow-up).
      throw new Error(`Email provider "${e.EMAIL_PROVIDER}" is not configured yet`);
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await resolveProvider().send(message);
}
