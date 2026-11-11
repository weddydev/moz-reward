import { cx } from "@/lib/cx";
import type { LucideIcon } from "lucide-react";

/**
 * Icon wrapper (DESIGN §6): one outline set (Lucide), imported per icon by the caller
 * (`import { MapPin } from "lucide-react"; <Icon icon={MapPin} />`), always the 1.5px stroke.
 * Decorative by default; pass `label` when the icon alone carries meaning.
 */
export function Icon({
  icon: Glyph,
  size = 20,
  label,
  className,
}: {
  icon: LucideIcon;
  size?: 14 | 16 | 18 | 20 | 24 | 32;
  label?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      className={cx("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}
