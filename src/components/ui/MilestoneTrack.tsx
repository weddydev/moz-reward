import { Check } from "lucide-react";
import { cx } from "@/lib/cx";

export type Milestone = { label: string; reached: boolean };

/**
 * Static milestone track (DESIGN §6): horizontal on phones, vertical from `lg`. Each milestone says its
 * state in text for assistive tech ("reached", "next", "not reached yet"); the first unreached one is
 * `aria-current="step"`. Colour is never the only signal: reached dots also carry a tick.
 */
export function MilestoneTrack({
  label,
  steps,
  className,
}: {
  label: string;
  steps: ReadonlyArray<Milestone>;
  className?: string;
}): React.JSX.Element | null {
  if (steps.length === 0) return null;
  const current = steps.findIndex((s) => !s.reached);
  return (
    <ol aria-label={label} className={cx("flex min-w-0 gap-0 lg:flex-col", className)}>
      {steps.map((s, i) => {
        const state = s.reached ? "reached" : i === current ? "next" : "not reached yet";
        const isLast = i === steps.length - 1;
        return (
          <li
            // Labels can repeat; the position is the identity of a milestone on a track.

            key={i}
            aria-current={i === current ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center lg:flex-row lg:items-start lg:gap-3 lg:pb-6 lg:text-left lg:last:pb-0"
          >
            {/* Connector to the next milestone: gold when this one is reached. */}
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute top-3 left-1/2 h-0.5 w-full lg:top-6 lg:left-3 lg:h-full lg:w-0.5",
                  s.reached && steps[i + 1]?.reached ? "bg-gold-500" : "bg-line",
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cx(
                "relative grid size-6 shrink-0 place-items-center rounded-full border-2",
                s.reached
                  ? "border-gold-500 bg-gold-gradient text-ink"
                  : i === current
                    ? "border-gold-500 bg-surface"
                    : "border-ink-3 bg-surface",
              )}
            >
              {s.reached ? <Check size={14} strokeWidth={2.5} /> : null}
            </span>
            <span
              className={cx(
                "text-caption lg:text-small max-w-full min-w-0 px-1 [overflow-wrap:anywhere] lg:px-0 lg:pt-0.5",
                s.reached || i === current ? "text-ink font-semibold" : "text-ink-2",
              )}
            >
              {s.label}
              <span className="sr-only">, {state}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
