"use client";

import { LiquidChoice } from "./LiquidChoice";

/**
 * Segmented control (PD-05; DESIGN §6.3, §7.4): a short single choice drawn as a liquid choice: the selection
 * is a drop of liquid gold that pours to the new segment; arrow keys move and select, with a roving tabindex.
 * Controlled. Same API as before PD-05.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string; detail?: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return <LiquidChoice label={label} options={options} value={value} onChange={onChange} />;
}
