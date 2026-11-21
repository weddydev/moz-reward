import { Fraunces, Manrope } from "next/font/google";

/**
 * Headings: Fraunces variable with optical size, softness and wonk (Molten animates weight and softness and uses
 * the wonky italic for brand marks; DESIGN v2 §4, PD-02), upright and italic; preloaded (above-the-fold heading).
 */
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: "normal",
  display: "swap",
  variable: "--font-fraunces",
  preload: true,
});

/**
 * UI/body: Manrope variable (the file spans 200–800; Molten uses 400–800). Preloaded + `display: optional`
 * (human, 21 Nov 2026): ready inside the ~100 ms block period on practically every load and never swapped in
 * late, so body text can't re-wrap (Linux and Android have no Arial for next/font's matched fallback; Linux CI
 * measured CLS 0.004). A very slow first visit keeps the metric-matched fallback for that page only.
 */
export const manrope = Manrope({
  subsets: ["latin"],
  display: "optional",
  variable: "--font-manrope",
  preload: true,
});
