import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from "react";
import { cx } from "@/lib/cx";
import { type Common, describedBy, FIELD, FieldWrapper as Wrapper } from "./field";

/** Label above, 48px input, surface-2 fill, error below linked via aria-describedby (DESIGN §6, §13). */
export function TextField({
  label,
  hint,
  error,
  className,
  id: idProp,
  "aria-describedby": extraDescribedBy,
  ...input
}: Common & InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className}>
      <input
        {...input}
        id={id}
        className={cx(FIELD, "h-12")}
        aria-invalid={error ? true : input["aria-invalid"]}
        aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
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
  "aria-describedby": extraDescribedBy,
  ...input
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        {...input}
        id={id}
        rows={rows}
        className={cx(FIELD, "resize-y py-3 leading-normal")}
        aria-invalid={error ? true : input["aria-invalid"]}
        aria-describedby={describedBy(id, error, hint, extraDescribedBy)}
      />
    </Wrapper>
  );
}
