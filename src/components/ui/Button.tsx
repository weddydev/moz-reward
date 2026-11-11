import { cx } from "@/lib/cx";
import { Spinner } from "./Spinner";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = 40 | 48 | 56;

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-gold text-ink",
  secondary: "pressable bg-surface text-ink border border-line shadow-1",
  ghost: "pressable bg-transparent text-ink hover:bg-surface-2",
  destructive: "pressable bg-danger text-on-danger",
};
const SIZE: Record<ButtonSize, string> = {
  // 40px drawn, 44px hit area (DESIGN §13).
  40: "hit-44 min-h-10 py-1.5 px-4 text-small gap-2 rounded-md",
  48: "min-h-12 py-2 px-5 text-body gap-2 rounded-md",
  56: "min-h-14 py-2.5 px-6 text-body gap-2.5 rounded-lg",
};

/** Class string for links styled as buttons (e.g. `<Link className={buttonClasses()} />`). */
export function buttonClasses({
  variant = "primary",
  size = 48,
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean | undefined;
  className?: string | undefined;
} = {}): string {
  return cx(
    // A long label wraps (centred) and the button grows from its minimum height; it is never cut, so the
    // visible text always matches the accessible name (P0-09 AC 6).
    "relative inline-flex max-w-full select-none items-center justify-center text-center font-semibold",
    "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
    VARIANT[variant],
    variant === "primary" && "pressable",
    SIZE[size],
    block && "w-full",
    className,
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner and blocks clicks; keeps the button's width (label stays in layout). */
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = 48,
  block,
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ...rest
}: Props): React.JSX.Element {
  return (
    <button
      {...rest}
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      // While loading: stay focusable (no `disabled`) but swallow clicks and form submits.
      onClick={
        loading
          ? (e) => {
              e.preventDefault();
            }
          : onClick
      }
    >
      <span
        className={cx(
          "inline-flex min-w-0 items-center gap-[inherit] [overflow-wrap:break-word]",
          loading && "opacity-0",
        )}
      >
        {icon}
        {children}
      </span>
      {loading ? (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}
