/**
 * Letters in a name's longest word (at least 1; an accented letter counts once): a title in a narrow column steps
 * its size down only when that word wouldn't fit, so the word keeps its letters together (the shop cover, P1-09;
 * the receipt, P1-D close QA MINOR 6).
 */
export function longestWord(name: string): number {
  const letters = new Intl.Segmenter("en-GB", { granularity: "grapheme" });
  return Math.max(1, ...name.split(/\s+/).map((w) => [...letters.segment(w)].length));
}
