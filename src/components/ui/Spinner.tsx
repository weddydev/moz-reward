import { cx } from "@/lib/cx";

/** Inline spinner (one turn per --dur-spin; still under reduced motion). Decorative: pair with text or aria-busy. */
export function Spinner({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx("spinner shrink-0", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
