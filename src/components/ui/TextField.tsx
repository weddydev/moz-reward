import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";

const FIELD =
  "w-full rounded-md border border-line bg-surface-2 px-4 text-body text-ink placeholder:text-ink-3 " +
  "transition-[border-color,background-color] duration-fast " +
  "focus-visible:border-gold-500 focus-visible:bg-surface aria-invalid:border-danger";

type Common = { label: string; hint?: string; error?: string; className?: string };

function Wrapper({
  id,
  label,
  hint,
  error,
  className,
  children,
}: Common & { id: string; children: React.ReactNode }) {
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

const describedBy = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

/** Label above, 48px input, surface-2 fill, error below linked via aria-describedby (DESIGN §6, §13). */
export function TextField({
  label,
  hint,
  error,
  className,
  id: idProp,
  ...input
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className={cx(FIELD, "h-12")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </Wrapper>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  id: idProp,
  rows = 4,
  ...input
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        rows={rows}
        className={cx(FIELD, "resize-y py-3 leading-normal")}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </Wrapper>
  );
}
