import "server-only";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { render } from "@react-email/render";
import { colourTokens as c } from "@/styles/tokens";

/**
 * Customer sign-in link email (P0-06). UK English, plain and short. The link appears as a button and as
 * text (some clients strip buttons). Never log the rendered output: it contains a sign-in token.
 */
export const MAGIC_LINK_SUBJECT = "Your Moz Rewards sign-in link";
const EXPIRY = "15 minutes";

function MagicLinkEmail({ url }: { url: string }): React.JSX.Element {
  return (
    <Html lang="en-GB">
      <Head />
      <Preview>Your sign-in link for Moz Rewards. It works once and expires in {EXPIRY}.</Preview>
      <Body
        style={{ backgroundColor: c.bg, color: c.ink, fontFamily: "Helvetica, Arial, sans-serif" }}
      >
        <Container style={{ maxWidth: 480, margin: "0 auto", padding: "32px 24px" }}>
          <Text style={{ fontSize: 14, letterSpacing: 1, color: c["gold-700"], margin: 0 }}>
            MOZ REWARDS
          </Text>
          <Heading as="h1" style={{ fontSize: 24, lineHeight: "32px", margin: "16px 0 8px" }}>
            Sign in to Moz Rewards
          </Heading>
          <Text style={{ fontSize: 16, lineHeight: "24px", color: c["ink-2"] }}>
            Tap the button to sign in. The link works once and expires in {EXPIRY}.
          </Text>
          <Section style={{ margin: "24px 0" }}>
            <Button
              href={url}
              style={{
                backgroundColor: c["gold-700"],
                color: c.surface,
                borderRadius: 12,
                padding: "14px 24px",
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in
            </Button>
          </Section>
          <Text style={{ fontSize: 14, lineHeight: "20px", color: c["ink-2"] }}>
            Or copy this link into your browser:
            <br />
            <span style={{ wordBreak: "break-all" }}>{url}</span>
          </Text>
          <Hr style={{ borderColor: c.line, margin: "24px 0" }} />
          <Text style={{ fontSize: 13, lineHeight: "20px", color: c["ink-2"] }}>
            If you didn&apos;t ask for this, you can ignore this email. Nobody can sign in without
            the link.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderMagicLinkEmail(
  url: string,
): Promise<{ subject: string; html: string; text: string }> {
  const html = await render(<MagicLinkEmail url={url} />);
  const text = [
    "Sign in to Moz Rewards",
    "",
    `Tap the link below to sign in. It works once and expires in ${EXPIRY}.`,
    "",
    url,
    "",
    "If you didn't ask for this, you can ignore this email. Nobody can sign in without the link.",
  ].join("\n");
  return { subject: MAGIC_LINK_SUBJECT, html, text };
}
