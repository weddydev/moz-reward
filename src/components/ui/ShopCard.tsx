import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { ProgressBar } from "./ProgressBar";

/** Wallet shop card (DESIGN §6): 64px photo, name, 1-line address, 4px gold progress, label, badges. */
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
}) {
  return (
    <Card className="flex w-full min-w-0 gap-3 p-3">
      <div className="bg-surface-2 size-16 shrink-0 overflow-hidden rounded-md">{photo}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-h3 truncate">{name}</p>
          {badges ? <div className="flex shrink-0 gap-1">{badges}</div> : null}
        </div>
        <p className="text-small text-ink-2 flex items-center gap-1 truncate">
          <MapPin aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{address}</span>
        </p>
        <ProgressBar value={progress} label={`${name} progress`} />
        <p className="text-caption text-gold-700 tabular font-semibold">{progressLabel}</p>
      </div>
    </Card>
  );
}
