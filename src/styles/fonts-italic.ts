import { Fraunces } from "next/font/google";

/**
 * Fraunces italic (brand marks and emphasis; DESIGN v2 §4, PD-02). Its own module on purpose: next/font loads and
 * preloads a font only on the routes that import it, so the 146 KB italic reaches only pages that show italic
 * (import this and put `frauncesItalic.variable` on the element). `display: optional` (human, 20 Nov): it never
 * swaps in late, so it never shifts the layout (a late swap moved the heading: CLS 0.0068); on a slow first
 * visit that page shows the fallback italic, every later page the real one. Same family name as the upright
 * instance, so the browser picks it for `font-style: italic`.
 */
export const frauncesItalic = Fraunces({
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: "italic",
  display: "optional",
  variable: "--font-fraunces-italic",
  preload: true,
});
