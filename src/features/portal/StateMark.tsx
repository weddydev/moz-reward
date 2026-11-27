import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import type { LucideIcon } from "lucide-react";

/**
 * Lucide's `circle-alert`, drawn here so the error boundaries (`error.tsx`, `global-error.tsx`, in every page's initial
 * JS) don't ship Lucide's client runtime for one glyph (C-91). Same node and attributes as `<Icon size={32} />`.
 */
function AlertGlyph(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={32}
      height={32}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="lucide lucide-circle-alert shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

/**
 * The state pages' mark (PD-11, extended from the reference): a struck gold coin with the icon on it, or, for an
 * error, a placed ivory disc with the icon in the danger colour (gold would read as good news).
 */
export function StateMark({
  icon,
  tone = "gold",
}: {
  /** A Lucide icon, or `"alert"` for the error mark (drawn inline, no Lucide runtime). */
  icon: LucideIcon | "alert";
  tone?: "gold" | "danger";
}): React.JSX.Element {
  return (
    <span aria-hidden="true" className="block size-16" data-testid="state-mark">
      <span
        className={cx(
          tone === "gold"
            ? "m-coin"
            : "m-placed text-danger grid size-full place-items-center rounded-full",
        )}
      >
        {icon === "alert" ? <AlertGlyph /> : <Icon icon={icon} size={32} />}
      </span>
    </span>
  );
}
