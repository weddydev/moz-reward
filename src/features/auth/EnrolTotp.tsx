"use client";

import QRCode from "qrcode";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeReturnTo } from "@/lib/return-to";
import { formValue, useHydrated } from "@/lib/use-hydrated";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./AuthCard";

type Enrolment = { qr: string; secret: string; backupCodes: string[] };

export function EnrolTotp() {
  const router = useRouter();
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"), "/dashboard");
  const ids = { password: useId(), code: useId(), error: useId() };
  const hydrated = useHydrated();
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    if (!password) {
      setError("Please confirm your password.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await authClient.twoFactor.enable({ password });
    setBusy(false);
    if (err || !data || !("totpURI" in data)) {
      setError("Password is incorrect.");
      return;
    }
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(data.totpURI, {
      margin: 1,
      width: 220,
      color: { dark: "#1C1A17", light: "#FFFFFF" },
    });
    form.reset();
    setEnrolment({ qr, secret, backupCodes: data.backupCodes });
  }

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = formValue(e.currentTarget, "code");
    if (code.replace(/\s/g, "").length < 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    if (err) {
      setBusy(false);
      setError("That code didn't work. Check the time on your phone and try again.");
      return;
    }
    // Start a fresh, MFA-verified session.
    await authClient.signOut();
    router.push(`/staff/sign-in?enrolled=1&returnTo=${encodeURIComponent(returnTo)}`);
  }

  if (!enrolment) {
    return (
      <form method="post" onSubmit={start} className="flex flex-col gap-3" noValidate>
        <p className="text-[#5C564C]">
          Staff and admin accounts need two-step verification. You&apos;ll need an authenticator app
          such as Google Authenticator, Microsoft Authenticator or 1Password.
        </p>
        <label htmlFor={ids.password} className="text-sm font-semibold">
          Confirm your password
        </label>
        <input
          id={ids.password}
          type="password"
          autoComplete="current-password"
          required
          name="password"
          className={inputClass}
          aria-describedby={error ? ids.error : undefined}
        />
        {error ? (
          <p id={ids.error} role="alert" className="text-sm text-[#B3432F]">
            {error}
          </p>
        ) : null}
        <button type="submit" className={primaryButtonClass} disabled={!hydrated || busy}>
          {busy ? "Setting up…" : "Set up two-step verification"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-[#5C564C]">
        <li>Scan this code with your authenticator app.</li>
        <li>Save your backup codes somewhere safe.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR, not an optimisable asset */}
      <img
        src={enrolment.qr}
        width={220}
        height={220}
        alt="QR code for your authenticator app"
        className="self-center rounded-[14px]"
      />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Can&apos;t scan? Enter this key</summary>
        <code className="mt-2 block rounded-[8px] bg-[#F4EEE2] p-2 break-all">
          {enrolment.secret}
        </code>
      </details>
      <div>
        <p className="text-sm font-semibold">Backup codes (each works once)</p>
        <ul
          className="mt-2 grid grid-cols-2 gap-1 rounded-[14px] bg-[#F4EEE2] p-3 font-mono text-sm tabular-nums"
          data-testid="backup-codes"
        >
          {enrolment.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          className={`${secondaryButtonClass} mt-2`}
          onClick={async () => {
            await navigator.clipboard.writeText(enrolment.backupCodes.join("\n"));
            setSavedCodes(true);
          }}
        >
          {savedCodes ? "Copied" : "Copy backup codes"}
        </button>
      </div>
      <form method="post" onSubmit={confirm} className="flex flex-col gap-3" noValidate>
        <label htmlFor={ids.code} className="text-sm font-semibold">
          6-digit code
        </label>
        <input
          id={ids.code}
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          name="code"
          className={`${inputClass} tracking-widest tabular-nums`}
          aria-describedby={error ? ids.error : undefined}
        />
        {error ? (
          <p id={ids.error} role="alert" className="text-sm text-[#B3432F]">
            {error}
          </p>
        ) : null}
        <button type="submit" className={primaryButtonClass} disabled={!hydrated || busy}>
          {busy ? "Checking…" : "Turn on two-step verification"}
        </button>
      </form>
    </div>
  );
}
