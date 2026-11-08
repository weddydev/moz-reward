"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/return-to";
import { formValue, useHydrated } from "@/lib/use-hydrated";
import { inputClass, primaryButtonClass } from "./AuthCard";

const GENERIC = "Email or password is incorrect.";

export function StaffSignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"), "/dashboard");
  const ids = { email: useId(), password: useId(), code: useId(), error: useId() };
  const [step, setStep] = useState<"password" | "code">("password");
  const [useBackup, setUseBackup] = useState(false);
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = formValue(e.currentTarget, "email");
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (err || !data) {
      setError(err?.status === 429 ? "Too many attempts — please wait and try again." : GENERIC);
      return;
    }
    if ("twoFactorRedirect" in data && data.twoFactorRedirect) {
      setStep("code");
      return;
    }
    // Signed in but 2FA not set up yet: staff/admin must enrol before any portal access.
    router.push(`/staff/security?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = formValue(e.currentTarget, "code");
    if (!code) {
      setError("Please enter your code.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setBusy(false);
    if (res.error) {
      setError("That code didn't work. Check your authenticator app and try again.");
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  const errorEl = error ? (
    <p id={ids.error} role="alert" className="text-sm text-[#B3432F]">
      {error}
    </p>
  ) : null;

  if (step === "code") {
    return (
      <form method="post" onSubmit={submitCode} className="flex flex-col gap-3" noValidate>
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
          className="text-sm font-semibold text-[#8A6A1F] underline-offset-4 hover:underline"
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
    <form method="post" onSubmit={submitPassword} className="flex flex-col gap-3" noValidate>
      {params.get("enrolled") ? (
        <p role="status" className="rounded-[14px] bg-[#F7EDD0] p-3 text-sm">
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
      {errorEl}
      <button type="submit" className={primaryButtonClass} disabled={!hydrated || busy}>
        {busy ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
