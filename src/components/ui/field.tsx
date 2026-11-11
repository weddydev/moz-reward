import { cx } from "@/lib/cx";

/** Shared wiring for labelled form fields (TextField, TextArea, Select): label above, error or hint below. */
export const FIELD =
  "w-full rounded-md border border-line bg-surface-2 px-4 text-body text-ink placeholder:text-ink-3 " +
  "transition-[border-color,background-color] duration-fast " +
  "focus-visible:border-gold-500 focus-visible:bg-surface aria-invalid:border-danger";

export type Common = {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
};

export function FieldWrapper({
  id,
  label,
  hint,
  error,
  className,
  children,
}: Common & { id: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-small text-ink font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-small text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-small text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Space-separated id list without blanks; undefined when empty (so no empty attribute is rendered). */
export const joinIds = (...ids: ReadonlyArray<string | undefined | false>): string | undefined =>
  ids
    .filter((x): x is string => typeof x === "string" && x.trim() !== "")
    .map((x) => x.trim())
    .join(" ") || undefined;

/** Own error (or hint) first, then the caller's ids; neither is dropped. */
export const describedBy = (
  id: string,
  error?: string,
  hint?: string,
  extra?: string,
): string | undefined => joinIds(error ? `${id}-error` : hint ? `${id}-hint` : undefined, extra);
