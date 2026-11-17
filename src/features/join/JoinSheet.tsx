"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { buttonClasses } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { withNetworkGuard } from "@/features/auth/network";
import { useHydrated } from "@/lib/use-hydrated";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { joinShopAction } from "./actions";
import {
  BIRTHDAY_INVALID,
  cleanPersonName,
  NAME_MAX,
  OVER_13_REQUIRED,
  validBirthday,
} from "./profile-input";

type Field = "fullName" | "phone" | "birthday" | "over13";
type Errors = Partial<Record<Field, string>>;

const FIELD_IDS: Record<Field, string> = {
  fullName: "join-name",
  phone: "join-phone",
  birthday: "join-birthday-day",
  over13: "join-over13",
};
const FIELD_ORDER: readonly Field[] = ["fullName", "phone", "birthday", "over13"];

const DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, i) => ({ value: String(i + 1), label }));

/**
 * "Collect points" for a signed-in visitor who isn't a member (PRODUCT §3, P1-04, C-52): the CTA and the join
 * sheet (BottomSheet on phones, Modal from 1024px). First join asks for the profile (name, UK mobile, optional
 * birthday, 13+); every join asks the shop's marketing question, unticked. The consent text and version come
 * from the server render, so a wording change reaches the sheet with `router.refresh()` (security design L11).
 * Before hydration the CTA is a link to `?join=1`, which opens the sheet once the page is interactive. What was
 * typed survives closing and reopening the sheet; nothing is stored until the join succeeds.
 */
export function JoinSheet({
  shopCode,
  shopName,
  needsProfile,
  consent,
  autoOpen,
}: {
  shopCode: string;
  shopName: string;
  needsProfile: boolean;
  consent: { version: string; text: string };
  autoOpen: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const hydrated = useHydrated();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(autoOpen);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [over13, setOver13] = useState(false);
  const [optIn, setOptIn] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // `?join=1` (back from sign-in, or a tap before hydration) has done its job once the sheet is open.
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("join")) return;
    url.searchParams.delete("join");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [autoOpen]);

  function check(): Errors {
    if (!needsProfile) return {};
    const out: Errors = {};
    const name = cleanPersonName(fullName);
    if (!name.ok) out.fullName = name.message;
    if (!phone.trim()) out.phone = "Please enter your UK mobile number.";
    if (day || month) {
      if (!day || !month || !validBirthday(Number(day), Number(month)))
        out.birthday = BIRTHDAY_INVALID;
    }
    if (!over13) out.over13 = OVER_13_REQUIRED;
    return out;
  }

  function showErrors(next: Errors): boolean {
    setErrors(next);
    const first = FIELD_ORDER.find((f) => next[f]);
    if (!first) return false;
    document.getElementById(FIELD_IDS[first])?.focus();
    return true;
  }

  async function submit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (pending) return;
    setFormError(null);
    if (showErrors(check())) return;
    setPending(true);
    const res = await withNetworkGuard(() =>
      joinShopAction({
        shopCode,
        marketingOptIn: optIn,
        consentVersion: consent.version,
        profile: needsProfile
          ? {
              fullName,
              phone,
              birthdayDay: day ? Number(day) : null,
              birthdayMonth: month ? Number(month) : null,
              over13,
            }
          : null,
      }),
    );
    if (!res.ok) {
      setFormError(res.message);
      setPending(false);
      return;
    }
    if (!res.value.ok) {
      const { error } = res.value;
      const fromServer: Errors = {};
      for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
        const field = key.replace(/^profile\./, "") as Field;
        if (field in FIELD_IDS && messages[0]) fromServer[field] = messages[0];
      }
      if (!showErrors(fromServer)) setFormError(error.message);
      if (error.code === "CONFLICT") {
        // The consent wording changed: fetch the new text and ask again, unticked.
        setOptIn(false);
        router.refresh();
      }
      setPending(false);
      return;
    }
    const { shopId, firstJoin } = res.value.data;
    router.push(`/shops/${shopId}${firstJoin ? "?welcome=1" : ""}`);
  }

  const Overlay = desktop ? Modal : BottomSheet;
  return (
    <>
      <Link
        href={`/s/${shopCode}?join=1`}
        className={buttonClasses({ size: 56, block: true })}
        data-testid="landing-collect"
        onClick={(e) => {
          if (!hydrated) return;
          e.preventDefault();
          setOpen(true);
        }}
      >
        Collect points
      </Link>
      <Overlay
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title={`Join ${shopName}`}
        description={
          needsProfile
            ? "A few details first. You only do this once."
            : "One question, then you can start collecting."
        }
        footer={
          <button
            type="submit"
            form="join-form"
            className={buttonClasses({ size: 56, block: true })}
            aria-disabled={pending}
            data-testid="join-submit"
          >
            {pending ? "Joining…" : `Join ${shopName}`}
          </button>
        }
      >
        <form
          id="join-form"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => void submit(e)}
          data-testid="join-form"
        >
          {needsProfile ? (
            <>
              <TextField
                id={FIELD_IDS.fullName}
                label="Full name"
                autoComplete="name"
                maxLength={NAME_MAX}
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                }}
                error={errors.fullName}
                required
              />
              <TextField
                id={FIELD_IDS.phone}
                label="UK mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                }}
                hint="Shops you join see it partly hidden. We don't send you texts."
                error={errors.phone}
                required
              />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-small text-ink mb-2 font-semibold">
                  Birthday (optional)
                </legend>
                <div className="grid grid-cols-[1fr_2fr] gap-3">
                  <Select
                    id={FIELD_IDS.birthday}
                    label="Day"
                    options={DAYS}
                    placeholder="Day"
                    value={day}
                    onChange={(e) => {
                      setDay(e.target.value);
                    }}
                    aria-invalid={errors.birthday ? true : undefined}
                    aria-describedby={
                      errors.birthday ? "join-birthday-error" : "join-birthday-hint"
                    }
                  />
                  <Select
                    label="Month"
                    options={MONTHS}
                    placeholder="Month"
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value);
                    }}
                    aria-invalid={errors.birthday ? true : undefined}
                    aria-describedby={
                      errors.birthday ? "join-birthday-error" : "join-birthday-hint"
                    }
                  />
                </div>
                {errors.birthday ? (
                  <p id="join-birthday-error" className="text-small text-danger">
                    {errors.birthday}
                  </p>
                ) : null}
                <p id="join-birthday-hint" className="text-small text-ink-2">
                  If you say yes to a shop&rsquo;s offers, it may send you a birthday treat. We
                  never ask for the year here.
                </p>
              </fieldset>
              <Checkbox
                id={FIELD_IDS.over13}
                label="I am 13 or over"
                checked={over13}
                onCheckedChange={setOver13}
                error={errors.over13}
                data-testid="join-over13"
              />
            </>
          ) : null}
          <Checkbox
            label={consent.text}
            checked={optIn}
            onCheckedChange={setOptIn}
            data-testid="join-marketing"
          />
          {formError ? (
            <p role="alert" className="text-small text-danger" data-testid="join-error">
              {formError}
            </p>
          ) : null}
        </form>
      </Overlay>
    </>
  );
}
