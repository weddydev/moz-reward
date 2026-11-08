/** Mailpit API helpers (TESTING §9): tests assert real SMTP output, never an in-memory fake. */
type MailpitSummary = { ID: string; To: Array<{ Address: string }>; Subject: string; Created: string };
export type CapturedEmail = { id: string; to: string; subject: string; text: string; html: string };

const api = (): string => process.env.MAILPIT_API_URL ?? "http://localhost:8025";

/** Waits (auto-retry, no fixed sleep) for the newest email to `to`, up to `timeoutMs`. */
export async function latestEmailTo(to: string, { timeoutMs = 10_000 }: { timeoutMs?: number } = {}): Promise<CapturedEmail> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${api()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=1`);
    if (!res.ok) throw new Error(`Mailpit search failed (${res.status}). Is Mailpit running? \`pnpm services:up\``);
    const body = (await res.json()) as { messages: MailpitSummary[] };
    const first = body.messages[0];
    if (first) {
      const msg = (await (await fetch(`${api()}/api/v1/message/${first.ID}`)).json()) as { ID: string; Subject: string; Text: string; HTML: string };
      return { id: msg.ID, to, subject: msg.Subject, text: msg.Text, html: msg.HTML };
    }
    if (Date.now() > deadline) throw new Error(`No email to ${to} arrived in Mailpit within ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** Number of emails Mailpit holds for `to` (for "nothing was sent" assertions). */
export async function countEmailsTo(to: string): Promise<number> {
  const res = await fetch(`${api()}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  const body = (await res.json()) as { messages_count: number };
  return body.messages_count;
}

export const firstLink = (text: string): string | undefined => text.match(/https?:\/\/\S+/)?.[0];
