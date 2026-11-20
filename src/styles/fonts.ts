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

/** UI/body: Manrope variable (the file spans 200–800; Molten uses 400–800); not preloaded (DESIGN §12 font budget). */
export const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  preload: false,
});
