import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmailSender,
  type EmailMessage,
  type EmailProvider,
  EmailProviderError,
} from "./index";

const logged = vi.hoisted(() => ({ warn: [] as unknown[][], error: [] as unknown[][] }));
vi.mock("@/server/log", () => ({
  log: () => ({
    warn: (...args: unknown[]) => logged.warn.push(args),
    error: (...args: unknown[]) => logged.error.push(args),
  }),
}));

const MESSAGE: EmailMessage = {
  kind: "magic-link",
  to: "someone@example.test",
  subject: "Your sign-in link",
  text: "https://app.example/sign-in/confirm?token=secret-token",
};

function fake(outcome: "ok" | Error): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: (m) => {
      if (outcome !== "ok") return Promise.reject(outcome);
      sent.push(m);
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  logged.warn.length = 0;
  logged.error.length = 0;
});

describe("[P0-19] email failover: primary, then the secondary (ARCHITECTURE §10)", () => {
  it("uses the primary when it works; the fallback is untouched", async () => {
    const primary = fake("ok");
    const fallback = fake("ok");
    const send = createEmailSender(
      { name: "resend", provider: primary },
      { name: "brevo", provider: fallback },
    );
    expect(await send(MESSAGE)).toEqual({ via: "resend" });
    expect(primary.sent).toHaveLength(1);
    expect(fallback.sent).toHaveLength(0);
    expect(logged.warn).toHaveLength(0);
  });

  it.each([
    ["quota reached", "http-429"],
    ["server error", "http-503"],
    ["timeout", "timeout"],
  ])(
    "fails over when the primary fails (%s), logging the reason but never the address or body",
    async (_label, reason) => {
      const fallback = fake("ok");
      const send = createEmailSender(
        { name: "resend", provider: fake(new EmailProviderError("resend", reason)) },
        { name: "brevo", provider: fallback },
      );
      expect(await send(MESSAGE)).toEqual({ via: "brevo" });
      expect(fallback.sent).toEqual([MESSAGE]);
      expect(logged.warn).toHaveLength(1);
      const line = JSON.stringify(logged.warn);
      expect(line).toContain(reason);
      expect(line).toContain("magic-link");
      expect(line).not.toContain(MESSAGE.to);
      expect(line).not.toContain("secret-token");
    },
  );

  it("both failing throws one error naming each provider's reason, without the address", async () => {
    const send = createEmailSender(
      { name: "resend", provider: fake(new EmailProviderError("resend", "http-429")) },
      { name: "brevo", provider: fake(new EmailProviderError("brevo", "timeout")) },
    );
    const err = await send(MESSAGE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmailProviderError);
    expect((err as Error).message).toBe("brevo: resend http-429; brevo timeout");
    expect(JSON.stringify([logged.warn, logged.error])).not.toContain(MESSAGE.to);
  });

  it("without a fallback (local/test), the primary's error is thrown as is", async () => {
    const failure = new EmailProviderError("smtp", "ECONNECTION");
    const send = createEmailSender({ name: "smtp", provider: fake(failure) });
    await expect(send(MESSAGE)).rejects.toBe(failure);
  });
});
