"use client";

import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { NAME_MAX } from "./profile-input";

export type ProfileField = "fullName" | "phone" | "birthday" | "over13";
export type ProfileErrors = Partial<Record<ProfileField, string>>;
export type ProfileDraft = {
  fullName: string;
  phone: string;
  day: string;
  month: string;
  over13: boolean;
};

export const EMPTY_PROFILE: ProfileDraft = {
  fullName: "",
  phone: "",
  day: "",
  month: "",
  over13: false,
};

/** The element each error focuses, in form order (the first error gets focus). */
export const PROFILE_FIELD_IDS: Record<ProfileField, string> = {
  fullName: "join-name",
  phone: "join-phone",
  birthday: "join-birthday-day",
  over13: "join-over13",
};
export const PROFILE_FIELD_ORDER: readonly ProfileField[] = [
  "fullName",
  "phone",
  "birthday",
  "over13",
];

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
 * The first-join profile (P1-04): full name, UK mobile, optional birthday (day and month, never the year) and
 * the 13+ confirmation. Controlled by the join sheet, which validates and sends it.
 */
export function ProfileFields({
  value,
  onChange,
  errors,
}: {
  value: ProfileDraft;
  onChange: (patch: Partial<ProfileDraft>) => void;
  errors: ProfileErrors;
}): React.JSX.Element {
  const birthdayDescribedBy = errors.birthday ? "join-birthday-error" : "join-birthday-hint";
  return (
    <>
      <TextField
        id={PROFILE_FIELD_IDS.fullName}
        label="Full name"
        autoComplete="name"
        maxLength={NAME_MAX}
        value={value.fullName}
        onChange={(e) => {
          onChange({ fullName: e.target.value });
        }}
        error={errors.fullName}
        required
      />
      <TextField
        id={PROFILE_FIELD_IDS.phone}
        label="UK mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={20}
        value={value.phone}
        onChange={(e) => {
          onChange({ phone: e.target.value });
        }}
        hint="Shops you join see it partly hidden. We don't send you texts."
        error={errors.phone}
        required
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small text-ink mb-2 font-semibold">Birthday (optional)</legend>
        {/* P1-A QA minor 6: the day column keeps room for "Day" next to the select's chevron at 320. */}
        <div className="grid grid-cols-[minmax(6.5rem,1fr)_2fr] gap-3">
          <Select
            id={PROFILE_FIELD_IDS.birthday}
            label="Day"
            options={DAYS}
            placeholder="Day"
            value={value.day}
            onChange={(e) => {
              onChange({ day: e.target.value });
            }}
            aria-invalid={errors.birthday ? true : undefined}
            aria-describedby={birthdayDescribedBy}
          />
          <Select
            label="Month"
            options={MONTHS}
            placeholder="Month"
            value={value.month}
            onChange={(e) => {
              onChange({ month: e.target.value });
            }}
            aria-invalid={errors.birthday ? true : undefined}
            aria-describedby={birthdayDescribedBy}
          />
        </div>
        {errors.birthday ? (
          <p id="join-birthday-error" className="text-small text-danger">
            {errors.birthday}
          </p>
        ) : null}
        <p id="join-birthday-hint" className="text-small text-ink-2">
          If you say yes to a shop&rsquo;s offers, it may send you a birthday treat. We never ask
          for the year here.
        </p>
      </fieldset>
      <Checkbox
        id={PROFILE_FIELD_IDS.over13}
        label="I am 13 or over"
        checked={value.over13}
        onCheckedChange={(over13) => {
          onChange({ over13 });
        }}
        error={errors.over13}
        data-testid="join-over13"
      />
    </>
  );
}
