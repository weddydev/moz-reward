import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSender, emailProvider } from "@/server/integrations/email";
import { testEmail } from "../fixtures/auth";
import { latestEmailTo } from "../support/mailpit";

const realFetch = globalThis.fetch;
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers the email providers' APIs with `status`; everything else (Mailpit) goes to the real network. */
function stubProviderApis(status: number, seen: Array<{ url: string; body: unknown }> = []) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (/api\.(resend|brevo)\.com/.test(url)) {
      seen.push({
        url,
        body: JSON.parse(typeof init?.body === "string" ? init.body : "null") as unknown,
      });
      return new Response("{}", { status });
    }
    return realFetch(input, init);
  });
  return seen;
}

describe("[P0-19] email failover (ARCHITECTURE §10: Resend → Brevo failover is tested)", () => {
  it("a primary at its quota (429) fails over and the mail is delivered by the secondary", async () => {
    stubProviderApis(429);
    const to = testEmail("failover");
    const send = createEmailSender(
      { name: "resend", provider: emailProvider("resend", "re_test") },
      { name: "smtp", provider: emailProvider("smtp") },
    );
    expect(
      await send({
        kind: "magic-link",
        to,
        subject: "Failover check",
        text: "Delivered by the secondary.",
      }),
    ).toEqual({ via: "smtp" });
    expect((await latestEmailTo(to)).subject).toBe("Failover check");
  });

  it("the Brevo provider sends the sender, recipient and both bodies in Brevo's shape", async () => {
    const seen = stubProviderApis(201);
    await emailProvider("brevo", "xkeysib-test").send({
      kind: "staff-lockout",
      to: "owner@example.test",
      subject: "Subject",
      text: "Plain",
      html: "<p>Rich</p>",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(seen[0]?.body).toMatchObject({
      sender: { email: expect.stringContaining("@") as unknown },
      to: [{ email: "owner@example.test" }],
      subject: "Subject",
      textContent: "Plain",
      htmlContent: "<p>Rich</p>",
    });
  });

  it("an API error becomes a loggable reason (status only)", async () => {
    stubProviderApis(503);
    await expect(
      emailProvider("resend", "re_test").send({
        kind: "x",
        to: "a@example.test",
        subject: "s",
        text: "t",
      }),
    ).rejects.toMatchObject({ provider: "resend", reason: "http-503" });
  });
});
