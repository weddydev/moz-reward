import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/AuthCard";
import { ConfirmSignInForm } from "@/features/auth/ConfirmSignInForm";
import { safeReturnTo } from "@/lib/return-to";
import {
  CONFIRM_POST_PATH,
  type ConfirmRetry,
  DEFAULT_RETURN,
  LINK_EXPIRED_PATH,
  isTokenShaped,
} from "@/lib/sign-in-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Finish signing in",
  robots: { index: false, follow: false },
};

const RETRY_MESSAGES: Record<ConfirmRetry, string> = {
  busy: "Too many attempts right now. Please wait a minute and try again — your link still works.",
  unavailable:
    "Sign-in is briefly unavailable. Please try again in a minute — your link still works.",
};

const one = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

/**
 * Where the email's sign-in link lands (P0-19 AC3). Opening it changes nothing: mail scanners and link
 * previews can GET it safely. The token is used only when the person presses "Sign in" (a plain form POST,
 * so it works before hydration and without JavaScript).
 */
export default async function ConfirmSignInPage({
  searchParams,
}: PageProps<"/sign-in/confirm">): Promise<React.JSX.Element> {
  const params = await searchParams;
  const token = one(params.token);
  if (!isTokenShaped(token)) redirect(LINK_EXPIRED_PATH);
  const returnTo = safeReturnTo(one(params.returnTo), DEFAULT_RETURN);
  const retry = one(params.retry);
  const retryMessage = retry === "busy" || retry === "unavailable" ? RETRY_MESSAGES[retry] : null;

  return (
    <AuthCard
      title="Finish signing in"
      subtitle="Press the button to sign in to Moz Rewards on this device."
    >
      <ConfirmSignInForm action={CONFIRM_POST_PATH} token={token} returnTo={returnTo}>
        {retryMessage ? (
          <p role="alert" className="bg-gold-100 rounded-md p-3 text-sm">
            {retryMessage}
          </p>
        ) : null}
      </ConfirmSignInForm>
      <p className="text-ink-2 text-sm">
        Didn&apos;t ask to sign in? You can close this page — nothing happens unless you press the
        button.
      </p>
    </AuthCard>
  );
}
