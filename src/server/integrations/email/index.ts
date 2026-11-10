import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { countEmailSent } from "@/server/ops/usage";

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

export type EmailProviderName = "smtp" | "resend" | "brevo";

const TIMEOUT_MS = 10_000;

function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = m?.[2]?.trim();
  if (!address) return { email: from.trim() };
  const name = m?.[1]?.trim();
  return name ? { name, email: address } : { email: address };
}

/** A provider error that is safe to log: a status or code, never the recipient or the body. */
export class EmailProviderError extends Error {
  constructor(
    readonly provider: EmailProviderName,
    readonly reason: string,
  ) {
    super(`${provider}: ${reason}`);
    this.name = "EmailProviderError";
  }
}

let smtpTransport: Transporter | undefined;

/** SMTP (Mailpit in local/test; any SMTP relay elsewhere). */
const smtpProvider: EmailProvider = {
  async send(message) {
    const e = env();
    smtpTransport ??= nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT ?? 1025,
      secure: false,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    try {
      await smtpTransport.sendMail({
        from: e.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      });
    } catch (err) {
      // nodemailer messages can quote the recipient: keep only its code.
      const info = (err ?? {}) as { code?: string; responseCode?: number };
      throw new EmailProviderError(
        "smtp",
        info.responseCode ? String(info.responseCode) : (info.code ?? "send failed"),
      );
    }
  },
};

async function postJson(
  provider: EmailProviderName,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new EmailProviderError(
      provider,
      (err as Error).name === "TimeoutError" ? "timeout" : "network",
    );
  }
  if (!res.ok) throw new EmailProviderError(provider, `http-${String(res.status)}`);
}

const resendProvider = (apiKey: string): EmailProvider => ({
  async send(message) {
    await postJson(
      "resend",
      "https://api.resend.com/emails",
      { authorization: `Bearer ${apiKey}` },
      {
        from: env().EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      },
    );
  },
});

const brevoProvider = (apiKey: string): EmailProvider => ({
  async send(message) {
    await postJson(
      "brevo",
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": apiKey },
      {
        sender: parseFrom(env().EMAIL_FROM),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      },
    );
  },
});

/** A provider by name with its key (the sender wires primary + fallback; tests build their own). */
export function emailProvider(name: EmailProviderName, apiKey?: string): EmailProvider {
  switch (name) {
    case "smtp":
      return smtpProvider;
    case "resend":
      return resendProvider(apiKey ?? "");
    case "brevo":
      return brevoProvider(apiKey ?? "");
    default: {
      const unreachable: never = name;
      throw new Error(`Unknown email provider: ${String(unreachable)}`);
    }
  }
}

type Named = { name: EmailProviderName; provider: EmailProvider };
export type EmailSender = (message: EmailMessage) => Promise<{ via: EmailProviderName }>;

const reasonOf = (err: unknown): string =>
  err instanceof EmailProviderError ? err.reason : err instanceof Error ? err.name : "error";

/**
 * Primary, then the secondary when the primary fails for any reason (error status incl. its quota's 429,
 * timeout, network): ARCHITECTURE §2/§10, P0-19. Both failing throws an EmailProviderError naming each
 * provider's reason only. Logs carry the kind and reasons, never the address or body. The daily budget and
 * drop order are P2-11's.
 */
export function createEmailSender(primary: Named, fallback?: Named): EmailSender {
  return async (message) => {
    try {
      await primary.provider.send(message);
      return { via: primary.name };
    } catch (err) {
      if (!fallback) throw err;
      log().warn(
        {
          kind: message.kind,
          provider: primary.name,
          reason: reasonOf(err),
          fallback: fallback.name,
        },
        "email provider failed; sending through the fallback",
      );
      try {
        await fallback.provider.send(message);
        return { via: fallback.name };
      } catch (second) {
        log().error(
          { kind: message.kind, provider: fallback.name, reason: reasonOf(second) },
          "email fallback provider failed too",
        );
        throw new EmailProviderError(
          fallback.name,
          `${primary.name} ${reasonOf(err)}; ${fallback.name} ${reasonOf(second)}`,
        );
      }
    }
  };
}

let shared: EmailSender | undefined;

function sender(): EmailSender {
  if (shared) return shared;
  const e = env();
  const fallback = e.EMAIL_FALLBACK_PROVIDER;
  shared = createEmailSender(
    { name: e.EMAIL_PROVIDER, provider: emailProvider(e.EMAIL_PROVIDER, e.EMAIL_API_KEY) },
    fallback
      ? { name: fallback, provider: emailProvider(fallback, e.EMAIL_FALLBACK_API_KEY) }
      : undefined,
  );
  return shared;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await sender()(message);
  // P0-13: today's sends vs the providers' combined cap (70% alert, System page).
  countEmailSent();
}

/** One named provider with the configured key, for `pnpm test:live` (each provider proved on its own). */
export function configuredProvider(which: "primary" | "fallback"): Named | null {
  const e = env();
  if (which === "primary") {
    return { name: e.EMAIL_PROVIDER, provider: emailProvider(e.EMAIL_PROVIDER, e.EMAIL_API_KEY) };
  }
  const name = e.EMAIL_FALLBACK_PROVIDER;
  return name ? { name, provider: emailProvider(name, e.EMAIL_FALLBACK_API_KEY) } : null;
}
