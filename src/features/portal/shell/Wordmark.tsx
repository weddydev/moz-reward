import { Crown } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";

/** The Moz Rewards name with its crown mark. `compact` shows the crown only (collapsed customer rail). */
export function Wordmark({
  compact = false,
  className,
  labelClassName,
}: {
  compact?: boolean;
  className?: string;
  labelClassName?: string;
}): React.JSX.Element {
  return (
    <span className={cx("text-ink flex items-center gap-2", className)}>
      <span className="text-gold-deep grid size-10 shrink-0 place-items-center">
        <Icon icon={Crown} size={24} />
      </span>
      <span className={cx("text-h3 whitespace-nowrap", compact && "sr-only", labelClassName)}>
        Moz Rewards
      </span>
    </span>
  );
}
