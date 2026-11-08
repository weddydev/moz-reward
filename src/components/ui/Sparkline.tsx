/** Tiny SVG sparkline (no chart library — DESIGN §6). Decorative; the KPI value carries the meaning. */
export function sparklinePath(
  values: ReadonlyArray<number>,
  width: number,
  height: number,
  pad = 2,
): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M${pad},${height / 2}L${width - pad},${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = pad + (height - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

export function Sparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: ReadonlyArray<number>;
  width?: number;
  height?: number;
}): React.JSX.Element {
  const d = sparklinePath(values, width, height);
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="text-gold-500"
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
