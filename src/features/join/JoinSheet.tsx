"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { withNetworkGuard } from "@/features/auth/network";
import { useHydrated } from "@/lib/use-hydrated";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { joinShopAction } from "./actions";
import {
  BIRTHDAY_INVALID,
  cleanPersonName,
  OVER_13_REQUIRED,
  validBirthday,
} from "./profile-input";
import {
  EMPTY_PROFILE,
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_ORDER,
  type ProfileDraft,
  type ProfileErrors,
  type ProfileField,
  ProfileFields,
} from "./ProfileFields";

/** Longer names make the footer button "Join" so it stays one line at 320 (P1-A QA minor 5). */
const BUTTON_NAME_MAX = 24;

/**
 * "Collect points" for a signed-in visitor who isn't a member (PRODUCT §3, P1-04, C-52): the CTA and the join
 * sheet (BottomSheet on phones, Modal from 1024px). First join asks for the profile (name, UK mobile, optional
 * birthday, 13+); every join asks the shop's marketing question, unticked. The consent text and version come
 * from the server render, so a wording change reaches the sheet with `router.refresh()` (security design L11).
 * Before hydration the CTA is a link to `?join=1`, which opens the sheet once the page is interactive. What was
 * typed survives closing and reopening the sheet; nothing is stored until the join succeeds. A form-level error
 * shows in the footer, by the button, so it is on screen however far the form is scrolled (P1-A DES-M1).
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
  /** The question as rendered; `shopName` is sent back so the server can tell the customer saw today's text. */
  consent: { version: string; question: string; details: string; shopName: string };
  autoOpen: boolean;
}): React.JSX.Element {
  const router = useRouter();
  const hydrated = useHydrated();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(autoOpen);
  const [profile, setProfile] = useState<ProfileDraft>(EMPTY_PROFILE);
  const [optIn, setOptIn] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** The shop refused the join (not taking members): the button can only close the sheet. */
  const [refused, setRefused] = useState(false);
  const [pending, setPending] = useState(false);
  // State lags a second tap in the same task (double tap, Enter + click): the ref doesn't (P1-A QA minor 4).
  const inFlight = useRef(false);

  // `?join=1` (back from sign-in, or a tap before hydration) has done its job once the sheet is open.
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("join")) return;
    url.searchParams.delete("join");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [autoOpen]);

  function check(): ProfileErrors {
    if (!needsProfile) return {};
    const out: ProfileErrors = {};
    const name = cleanPersonName(profile.fullName);
    if (!name.ok) out.fullName = name.message;
    if (!profile.phone.trim()) out.phone = "Please enter your UK mobile number.";
    if (profile.day || profile.month) {
      if (
        !profile.day ||
        !profile.month ||
        !validBirthday(Number(profile.day), Number(profile.month))
      )
        out.birthday = BIRTHDAY_INVALID;
    }
    if (!profile.over13) out.over13 = OVER_13_REQUIRED;
    return out;
  }

  function showErrors(next: ProfileErrors): boolean {
    setErrors(next);
    const first = PROFILE_FIELD_ORDER.find((f) => next[f]);
    if (!first) return false;
    document.getElementById(PROFILE_FIELD_IDS[first])?.focus();
    return true;
  }

  function done(): void {
    inFlight.current = false;
    setPending(false);
  }

  async function submit(e: SyntheticEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (inFlight.current || refused) return;
    setFormError(null);
    if (showErrors(check())) return;
    inFlight.current = true;
    setPending(true);
    const res = await withNetworkGuard(() =>
      joinShopAction({
        shopCode,
        marketingOptIn: optIn,
        consentVersion: consent.version,
        consentShopName: consent.shopName,
        profile: needsProfile
          ? {
              fullName: profile.fullName,
              phone: profile.phone,
              birthdayDay: profile.day ? Number(profile.day) : null,
              birthdayMonth: profile.month ? Number(profile.month) : null,
              over13: profile.over13,
            }
          : null,
      }),
    );
    if (!res.ok) {
      setFormError(res.message);
      done();
      return;
    }
    if (!res.value.ok) {
      const { error } = res.value;
      if (error.code === "UNAUTHENTICATED") {
        // The session ended while the sheet was open: sign in again and come back to it (P1-A QA minor 3).
        router.push(`/sign-in?returnTo=${encodeURIComponent(`/s/${shopCode}?join=1`)}`);
        return;
      }
      const fromServer: ProfileErrors = {};
      for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
        const field = key.replace(/^profile\./, "") as ProfileField;
        if (field in PROFILE_FIELD_IDS && messages[0]) fromServer[field] = messages[0];
      }
      if (!showErrors(fromServer)) setFormError(error.message);
      if (error.code === "FORBIDDEN") setRefused(true);
      if (error.code === "CONFLICT") {
        // The consent wording changed: fetch the new text and ask again, unticked.
        setOptIn(false);
        router.refresh();
      }
      done();
      return;
    }
    const { shopId, firstJoin } = res.value.data;
    router.push(`/shops/${shopId}${firstJoin ? "?welcome=1" : ""}`);
  }

  const close = (): void => {
    if (!pending) setOpen(false);
  };
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
        onClose={close}
        title={`Join ${shopName}`}
        description={
          needsProfile
            ? "A few details first. You only do this once."
            : "One question, then you can start collecting."
        }
        footer={
          <div className="flex w-full flex-col gap-3">
            {formError ? (
              <p role="alert" className="text-small text-danger" data-testid="join-error">
                {formError}
              </p>
            ) : null}
            {refused ? (
              <Button size={56} block variant="secondary" onClick={close} data-testid="join-submit">
                Close
              </Button>
            ) : (
              <Button
                type="submit"
                form="join-form"
                size={56}
                block
                loading={pending}
                data-testid="join-submit"
              >
                {shopName.length > BUTTON_NAME_MAX ? "Join" : `Join ${shopName}`}
              </Button>
            )}
          </div>
        }
      >
        <form
          id="join-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => void submit(e)}
          data-testid="join-form"
        >
          {needsProfile ? (
            <ProfileFields
              value={profile}
              onChange={(patch) => {
                setProfile((p) => ({ ...p, ...patch }));
              }}
              errors={errors}
            />
          ) : null}
          <Checkbox
            label={consent.question}
            description={consent.details}
            checked={optIn}
            onCheckedChange={setOptIn}
            data-testid="join-marketing"
          />
        </form>
      </Overlay>
    </>
  );
}
