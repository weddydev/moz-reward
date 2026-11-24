import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import type { LucideIcon } from "lucide-react";

/**
 * The state pages' mark (PD-11, extended from the reference): a struck gold coin with the icon on it, or, for an
 * error, a placed ivory disc with the icon in the danger colour (gold would read as good news).
 */
export function StateMark({
  icon,
  tone = "gold",
}: {
  icon: LucideIcon;
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
        <Icon icon={icon} size={32} />
      </span>
    </span>
  );
}
