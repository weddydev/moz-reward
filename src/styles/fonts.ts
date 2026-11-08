import { Fraunces, Manrope } from "next/font/google";

/** Headings: Fraunces variable with optical size; preloaded (above-the-fold heading weight). */
export const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-fraunces",
  preload: true,
});

/** UI/body: Manrope variable (400–700); not preloaded per DESIGN §12 font budget. */
export const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  preload: false,
});
