import { useId } from "react";
import type { MilestoneRule } from "@/lib/loyalty/programme";

/**
 * Static ingot for the settings preview (P1-05): a mould filled to a sample level with tick marks at the
 * milestones. The real Ingot component (bevel, wave, glint, pour) arrives in P1-08 and replaces this (C-59).
 * Decorative: the surrounding text says everything it shows.
 */
export function IngotPreview({
  percent,
  milestones,
}: {
  percent: number;
  milestones: readonly MilestoneRule[];
}): React.JSX.Element {
  const id = useId();
  const level = 90 - (80 * Math.max(0, Math.min(100, percent))) / 100;
  return (
    <svg viewBox="0 0 200 100" className="h-auto w-full max-w-60" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--gold-300)" />
          <stop offset="0.55" stopColor="var(--gold-500)" />
          <stop offset="1" stopColor="var(--gold-700)" />
        </linearGradient>
        <clipPath id={`${id}-mould`}>
          <polygon points="34,10 166,10 194,90 6,90" />
        </clipPath>
      </defs>
      <polygon points="34,10 166,10 194,90 6,90" fill="var(--surface-2)" />
      <rect
        x="0"
        y={level}
        width="200"
        height={100 - level}
        fill={`url(#${id}-gold)`}
        clipPath={`url(#${id}-mould)`}
      />
      {milestones.map((m) => {
        const y = 90 - (80 * m.percent) / 100;
        return (
          <line
            key={m.percent}
            x1="186"
            x2="198"
            y1={y}
            y2={y}
            stroke="var(--ink-2)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        );
      })}
      <polygon
        points="34,10 166,10 194,90 6,90"
        fill="none"
        stroke="var(--gold-700)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
