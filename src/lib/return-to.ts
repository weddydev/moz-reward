/** Allowlisted internal return paths only (SECURITY.md §4): must be a same-origin path. */
export function safeReturnTo(value: string | null | undefined, fallback = "/wallet"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return fallback;
  try {
    const base = "http://internal.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
