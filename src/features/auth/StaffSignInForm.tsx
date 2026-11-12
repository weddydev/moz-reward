"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Turnstile } from "@/components/security/Turnstile";
import { PORTAL_HOME } from "@/features/portal/routes";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/return-to";
import { TURNSTILE_HEADER, TURNSTILE_REQUIRED_CODE } from "@/lib/turnstile";
import { formString, formValue, useHydrated } from "@/lib/use-hydrated";
import { inputClass, primaryButtonClass } from "./AuthCard";
import { withNetworkGuard } from "./network";
import { PreparingHint } from "./PreparingHint";

const GENERIC = "Email or password is incorrect.";

/**
 * Our limiter (429) and fail-closed (503) answers say what to do next, so show them; a proxy's bare 429/503
 * (no message) gets copy that fits its status. Anything else stays generic (no account enumeration).
 */
function serverMessage(
  err: { status: number; message?: string | undefined },
  fallback: string,
): string {
  const text = err.message?.trim();
  if (err.status === 429) return text || "Too many attempts. Please wait and try again.";
  if (err.status === 503)
    return text || "Sign-in is briefly unavailable. Please try again in a minute.";
  return fallback;
}

export function StaffSignInForm(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"), PORTAL_HOME);
  const ids = { email: useId(), password: useId(), code: useId(), error: useId() };
  const [step, setStep] = useState<"password" | "code">("password");
  const [useBackup, setUseBackup] = useState(false);
  const hydrated = useHydrated();
  const preparingId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Security check (P0-19): an account past its failure limit needs a Turnstile token with the password.
  // The widget appears only then; while it works the button says "Checking…", and when its token arrives the
  // form re-sends itself, so most people see no extra step. A token is single-use: each attempt spends the
  // current one and the widget re-arms (new `round`).
  const [check, setCheck] = useState<{ round: number } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const checkToken = useRef("");
  const resendOnToken = useRef(false);
  const passwordForm = useRef<HTMLFormElement>(null);

  function waitForCheck() {
    resendOnToken.current = true;
    setWaiting(true);
  }

  function onCheckToken(token: string) {
    checkToken.current = token;
    if (!resendOnToken.current) return;
    if (token) {
      resendOnToken.current = false;
      setWaiting(false);
      passwordForm.current?.requestSubmit();
    } else {
      // The widget expired or failed to load (Cloudflare's error/expired callbacks).
      resendOnToken.current = false;
      setWaiting(false);
      setError("The security check didn't load. Please refresh the page and try again.");
    }
  }

  async function submitPassword(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formValue(e.currentTarget, "email");
    const password = formString(new FormData(e.currentTarget).get("password"));
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    const token = checkToken.current;
    if (check && !token) {
      setError(null);
      waitForCheck(); // sends as soon as the check finishes
      return;
    }
    checkToken.current = "";
    setBusy(true);
    setError(null);
    const call = await withNetworkGuard(() =>
      authClient.signIn.email({
        email,
        password,
        ...(token ? { fetchOptions: { headers: { [TURNSTILE_HEADER]: token } } } : {}),
      }),
    );
    setBusy(false);
    if (check) setCheck({ round: check.round + 1 }); // the token was spent: re-arm the widget
    if (!call.ok) {
      setError(call.message);
      return;
    }
    const { data, error: err } = call.value;
    if (err) {
      if (err.code === TURNSTILE_REQUIRED_CODE) {
        if (token) {
          // The check itself failed: say so, and let the person retry by hand with a fresh widget.
          setError(err.message?.trim() || "The security check didn't work. Please try it again.");
        } else {
          setCheck({ round: 0 });
          waitForCheck();
        }
        return;
      }
      setError(serverMessage(err, GENERIC));
      return;
    }
    if ("twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("code");
      return;
    }
    // Signed in but 2FA not set up yet: staff/admin must enrol before any portal access.
    router.push(`/staff/security?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submitCode(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = formValue(e.currentTarget, "code");
    if (!code) {
      setError("Please enter your code.");
      return;
    }
    setBusy(true);
    setError(null);
    const call = await withNetworkGuard(() =>
      useBackup
        ? authClient.twoFactor.verifyBackupCode({ code })
        : authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") }),
    );
    setBusy(false);
    if (!call.ok) {
      setError(call.message);
      return;
    }
    const codeError = call.value.error;
    if (codeError) {
      setError(
        serverMessage(
          codeError,
          useBackup
            ? "That backup code didn't work. Each code works once — try another one."
            : "That code didn't work. Check your authenticator app and try again.",
        ),
      );
      return;
    }
    // A full page load: the portal layouts read the new session, and `/portal` is a redirect, not a page.
    window.location.assign(returnTo);
  }

  const errorEl = error ? (
    <p id={ids.error} role="alert" className="text-danger text-sm">
      {error}
    </p>
  ) : null;

  if (step === "code") {
    return (
      <form
        method="post"
        onSubmit={(e) => void submitCode(e)}
        className="flex flex-col gap-3"
        noValidate
      >
        <label htmlFor={ids.code} className="text-sm font-semibold">
          {useBackup ? "Backup code" : "6-digit code from your authenticator app"}
        </label>
        <input
          id={ids.code}
          autoComplete="one-time-code"
          inputMode={useBackup ? "text" : "numeric"}
          pattern={useBackup ? undefined : "[0-9 ]*"}
          maxLength={useBackup ? 32 : 7}
          required
          autoFocus
          name="code"
          className={`${inputClass} tracking-widest tabular-nums`}
          aria-describedby={error ? ids.error : undefined}
        />
        {errorEl}
        <button type="submit" className={primaryButtonClass} disabled={!hydrated || busy}>
          {busy ? "Checking…" : "Verify"}
        </button>
        <button
          type="button"
          className="text-gold-700 text-sm font-semibold underline-offset-4 hover:underline"
          onClick={() => {
            setUseBackup((v) => !v);
            setError(null);
          }}
        >
          {useBackup ? "Use authenticator app instead" : "Use a backup code"}
        </button>
      </form>
    );
  }

  return (
    <form
      ref={passwordForm}
      method="post"
      onSubmit={(e) => void submitPassword(e)}
      className="flex flex-col gap-3"
      noValidate
    >
      {params.get("enrolled") ? (
        <p role="status" className="bg-gold-100 rounded-md p-3 text-sm">
          Two-step verification is on. Please sign in again with your code.
        </p>
      ) : null}
      <label htmlFor={ids.email} className="text-sm font-semibold">
        Email
      </label>
      <input
        id={ids.email}
        type="email"
        autoComplete="username"
        required
        name="email"
        maxLength={254}
        className={inputClass}
      />
      <label htmlFor={ids.password} className="text-sm font-semibold">
        Password
      </label>
      <input
        id={ids.password}
        type="password"
        autoComplete="current-password"
        required
        name="password"
        maxLength={128}
        className={inputClass}
        aria-describedby={error ? ids.error : undefined}
      />
      {/* Always mounted, so screen readers announce the text when the check starts (a live region that
          appears together with its content is often not read). */}
      <p role="status" className={check ? "bg-gold-100 rounded-md p-3 text-sm" : "sr-only"}>
        {!check
          ? ""
          : waiting
            ? "For your security, we're running a quick check before signing you in."
            : "A security check is on for this account. Press Continue to try again."}
      </p>
      {check ? <Turnstile key={check.round} action="staff-sign-in" onToken={onCheckToken} /> : null}
      {errorEl}
      <button
        type="submit"
        className={primaryButtonClass}
        disabled={!hydrated || busy || waiting}
        aria-describedby={hydrated ? undefined : preparingId}
      >
        {busy ? "Signing in…" : waiting ? "Checking…" : "Continue"}
      </button>
      <PreparingHint id={preparingId} hydrated={hydrated} />
    </form>
  );
}
