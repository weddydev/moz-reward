/**
 * A short, human name for a session's device ("Safari on iPhone") from its User-Agent, for the signed-in
 * devices list. Only fixed labels are returned, never parts of the raw header, so nothing user-controlled is
 * echoed back. Order matters: Edge and Samsung Internet also claim to be Chrome; Chrome on iOS claims Safari.
 */
const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const PLATFORMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows NT/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Linux/, "Linux"],
];

const match = (ua: string, table: ReadonlyArray<[RegExp, string]>): string | null =>
  table.find(([pattern]) => pattern.test(ua))?.[1] ?? null;

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").slice(0, 512);
  const platform = match(ua, PLATFORMS);
  if (!platform) return "Unknown device";
  return `${match(ua, BROWSERS) ?? "Browser"} on ${platform}`;
}
