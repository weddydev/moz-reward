import { cx } from "@/lib/cx";
import { Icon } from "./Icon";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type IconButtonVariant = "ghost" | "secondary";

/**
 * Icon-only button (DESIGN §6, §13): 44×44 target, the accessible name is the required `label`
 * (no visible text, so never optional). Press scale .97; hover only on fine pointers.
 */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  className,
  type = "button",
  disabled,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  icon: LucideIcon;
  label: string;
  variant?: IconButtonVariant;
}): React.JSX.Element {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-label={label}
      className={cx(
        "pressable text-ink inline-grid size-11 shrink-0 place-items-center rounded-md",
        variant === "ghost"
          ? "hover:bg-surface-2 bg-transparent"
          : "bg-surface border-line shadow-1 border",
        disabled && "cursor-not-allowed opacity-55",
        className,
      )}
    >
      <Icon icon={icon} />
    </button>
  );
}
