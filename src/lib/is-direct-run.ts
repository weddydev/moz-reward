import path from "node:path";

/**
 * True when the module at `moduleUrl` (pass `import.meta.url`) is the script node was started with.
 * Compares file paths, not URL strings: on Windows `import.meta.url` is `file:///D:/…` while argv
 * holds `D:\…`, so a naive `file://${argv[1]}` check never matches.
 */
export function isDirectRun(
  moduleUrl: string,
  argv1: string | undefined = process.argv[1],
  platform: "posix" | "win32" = process.platform === "win32" ? "win32" : "posix",
): boolean {
  if (!argv1) return false;
  const p = path[platform];
  const url = new URL(moduleUrl);
  let modulePath = decodeURIComponent(url.pathname);
  if (platform === "win32") modulePath = modulePath.replace(/^\/([A-Za-z]:)/, "$1");
  const norm = (s: string) =>
    platform === "win32" ? p.normalize(s).toLowerCase() : p.normalize(s);
  return norm(modulePath) === norm(p.resolve(argv1));
}
