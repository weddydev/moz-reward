import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
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

const TIMEOUT_MS = 10_000;

function parseFrom(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  const address = m?.[2]?.trim();
  if (!address) return { email: from.trim() };
  const name = m?.[1]?.trim();
  return name ? { name, email: address } : { email: address };
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
    await smtpTransport.sendMail({
      from: e.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
  },
};

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`email provider responded ${res.status}`);
}

const resendProvider: EmailProvider = {
  async send(message) {
    const e = env();
    await postJson(
      "https://api.resend.com/emails",
      { authorization: `Bearer ${e.EMAIL_API_KEY ?? ""}` },
      {
        from: e.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      },
    );
  },
};

const brevoProvider: EmailProvider = {
  async send(message) {
    const e = env();
    await postJson(
      "https://api.brevo.com/v3/smtp/email",
      { "api-key": e.EMAIL_API_KEY ?? "" },
      {
        sender: parseFrom(e.EMAIL_FROM),
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      },
    );
  },
};

function resolveProvider(): EmailProvider {
  const provider = env().EMAIL_PROVIDER;
  switch (provider) {
    case "smtp":
      return smtpProvider;
    case "resend":
      return resendProvider;
    case "brevo":
      return brevoProvider;
    default: {
      const unreachable: never = provider;
      throw new Error(`Unknown email provider: ${String(unreachable)}`);
    }
  }
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await resolveProvider().send(message);
}
