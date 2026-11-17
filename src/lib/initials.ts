/** Up to two initials (first and last word), for avatar and logo fallbacks. Pure: server and client. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letter = (w: string) => (Array.from(w)[0] ?? "").toLocaleUpperCase("en-GB");
  return letter(first) + (last ? letter(last) : "");
}
