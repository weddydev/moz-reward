import { cx } from "@/lib/cx";
import { barHeights } from "./chart";
import type { ChartBar } from "./overview";

/**
 * The Overview's weekly visits chart (P2-01, DESIGN §6 charts, screen 15): seven gold bars, today's the
 * strongest, each with its value above and its weekday below. A server component with no chart library and no
 * JavaScript (DECISIONS 28 Nov "P2-01 dashboard KPIs"): HTML bars keep their text crisp at every width, which a
 * scaled SVG would not. The drawing is hidden from assistive tech; a screen-reader table carries the numbers.
 */
export function VisitsChart({ bars }: { bars: readonly ChartBar[] }): React.JSX.Element {
  const heights = barHeights(bars.map((b) => b.value));
  return (
    <figure className="m-0 flex flex-col" data-testid="visits-chart">
      <div aria-hidden="true" className="border-line flex h-44 items-end gap-2 border-b sm:gap-3">
        {bars.map((bar, i) => (
          <div
            key={bar.date}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={bar.title}
            data-bar={bar.date}
            data-value={bar.value}
          >
            <span className="text-caption tabular text-ink font-semibold">
              {bar.value.toLocaleString("en-GB")}
            </span>
            <span
              className={cx(
                "w-full max-w-12 rounded-t-lg",
                bar.today
                  ? "from-gold to-gold-deep bg-gradient-to-b"
                  : "from-gold-light to-gold bg-gradient-to-b",
              )}
              style={{ height: `${String(heights[i] ?? 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-2 sm:gap-3">
        {bars.map((bar) => (
          <span
            key={bar.date}
            className={cx(
              "text-caption min-w-0 flex-1 text-center",
              bar.today ? "text-ink font-semibold" : "text-ink-2",
            )}
          >
            {bar.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Member visits in the last 7 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Visits</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.date}>
              <th scope="row">{bar.title.split(":")[0]}</th>
              <td>{bar.value.toLocaleString("en-GB")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
