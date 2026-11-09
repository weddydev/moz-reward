import "server-only";
import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { colourTokens as c } from "@/styles/tokens";

/** Sent to a staff/admin account when repeated wrong passwords pause its sign-in (P0-06, SECURITY §6). */
export const STAFF_LOCKOUT_SUBJECT = "Sign-in to your Moz Rewards staff account was paused";

const LINES = [
  "Someone entered the wrong password for your staff account several times, so we've paused sign-in for a few minutes.",
  "If that was you, wait a few minutes and try again.",
  "If it wasn't you, your account is still protected by two-step verification. Change your password when you next sign in, and let your shop owner know.",
];

function StaffLockoutEmail(): React.JSX.Element {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>We paused sign-in to your staff account after several wrong passwords.</Preview>
      <Body
        style={{ backgroundColor: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif" }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: "32px 24px" }}>
          <Heading as="h1" style={{ fontSize: 22, lineHeight: "30px" }}>
            Sign-in was paused
          </Heading>
          {LINES.map((line) => (
            <Text key={line} style={{ fontSize: 16, lineHeight: "24px", color: c["ink-2"] }}>
              {line}
            </Text>
          ))}
        </Container>
      </Body>
    </Html>
  );
}

export async function renderStaffLockoutEmail(): Promise<{
  subject: string;
  html: string;
  text: string;
}> {
  return {
    subject: STAFF_LOCKOUT_SUBJECT,
    html: await render(<StaffLockoutEmail />),
    text: ["Sign-in was paused", "", ...LINES].join("\n\n"),
  };
}
