import { MapPin } from "lucide-react";
import { Card } from "./Card";
import { ProgressBar } from "./ProgressBar";
import type { ReactNode } from "react";

/**
 * Wallet shop card (DESIGN §6): 64px photo, name (up to two lines, wrapping on word boundaries; a single
 * word too long for the line breaks inside it), 1-line address, 4px gold progress, then the progress label
 * with the badges beside it on the last row. The label is ink-2: gold text is for large text only (§3).
 */
export function ShopCard({
  name,
  address,
  photo,
  progress,
  progressLabel,
  badges,
}: {
  name: string;
  address: string;
  photo: ReactNode;
  /** 0–1 */
  progress: number;
  progressLabel: string;
  badges?: ReactNode;
}): React.JSX.Element {
  return (
    <Card className="flex w-full min-w-0 gap-3 p-3">
      <div className="bg-surface-2 size-16 shrink-0 overflow-hidden rounded-md">{photo}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-h3 line-clamp-2 [overflow-wrap:break-word]">{name}</p>
        <p className="text-small text-ink-2 flex items-center gap-1 truncate">
          <MapPin aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{address}</span>
        </p>
        <ProgressBar value={progress} label={`${name} progress`} />
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="text-caption text-ink-2 tabular min-w-0 font-semibold">{progressLabel}</p>
          {badges ? <div className="flex shrink-0 flex-wrap gap-1">{badges}</div> : null}
        </div>
      </div>
    </Card>
  );
}
