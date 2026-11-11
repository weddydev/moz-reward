import { Coffee } from "lucide-react";
import { cx } from "@/lib/cx";

/** Placeholder shop image for the morph demo (a real photo arrives with shops in P1). */
export function ShopThumb({ large = false }: { large?: boolean }): React.JSX.Element {
  return (
    <div
      className={cx(
        "bg-gold-100 text-gold-700 grid shrink-0 place-items-center",
        large ? "h-40 w-full rounded-lg" : "size-16 rounded-md",
      )}
    >
      <Coffee aria-hidden="true" strokeWidth={1.5} size={large ? 40 : 24} />
    </div>
  );
}
