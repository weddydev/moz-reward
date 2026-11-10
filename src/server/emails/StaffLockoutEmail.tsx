import "server-only";
import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { colourTokens as c } from "@/styles/tokens";

/**
 * Sent to a staff/admin account when repeated failures start a lockout (P0-06, P0-19; SECURITY §2):
 * - "password": wrong passwords. The account is not shut: the next sign-in needs a security check, and only
 *   the device that kept trying is paused (so nobody can keep the owner out).
 * - "second-factor": the password was right but the codes were wrong. Code entry is paused; someone may know
 *   the password.
 */
export type LockoutReason = "password" | "second-factor";

const CONTENT: Record<
  LockoutReason,
  { subject: string; preview: string; heading: string; lines: string[] }
> = {
  password: {
    subject: "Several wrong passwords were tried on your Moz Rewards staff account",
    preview: "Your next sign-in will ask for a quick security check.",
    heading: "Several wrong passwords were tried",
    lines: [
      "Someone entered the wrong password for your staff account several times. Your next sign-in will ask for a quick security check, and the device that kept trying is paused for a while.",
      "If that was you, complete the check when you next sign in.",
      "If it wasn't you, your account is still protected by two-step verification. Change your password when you next sign in, and let your shop owner know.",
    ],
  },
  "second-factor": {
    subject: "Several wrong codes were tried on your Moz Rewards staff account",
    preview: "Code entry is paused for a few minutes.",
    heading: "Several wrong codes were tried",
    lines: [
      "Someone entered your password correctly, then the wrong two-step verification code several times, so we've paused code entry for a few minutes.",
      "If that was you, check that your phone sets its time automatically, wait a few minutes and try again.",
      "If it wasn't you, someone may know your password. Change it as soon as you can and let your shop owner know.",
    ],
  },
};

function StaffLockoutEmail({ reason }: { reason: LockoutReason }): React.JSX.Element {
  const content = CONTENT[reason];
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>{content.preview}</Preview>
      <Body
        style={{ backgroundColor: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif" }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: "32px 24px" }}>
          <Heading as="h1" style={{ fontSize: 22, lineHeight: "30px" }}>
            {content.heading}
          </Heading>
          {content.lines.map((line) => (
            <Text key={line} style={{ fontSize: 16, lineHeight: "24px", color: c["ink-2"] }}>
              {line}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}

export const staffLockoutSubject = (reason: LockoutReason): string => CONTENT[reason].subject;

export async function renderStaffLockoutEmail(reason: LockoutReason): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  const content = CONTENT[reason];
  return {
    subject: content.subject,
    html: await render(<StaffLockoutEmail reason={reason} />),
    text: [content.heading, "", ...content.lines].join("\n\n"),
  };
}
