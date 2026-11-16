/**
 * A command-line time: ISO 8601 **with** a zone (`2026-11-10T09:30:00Z` or `+00:00`), not in the future. A
 * zone-less time is refused: during BST it would silently mean the wrong hour. Shared by `relay --replay-since`
 * and `backup:verify --target-time`.
 */
export function parseZonedTime(
  flag: string,
  arg: string | undefined,
  now: Date = new Date(),
): { ok: true; at: Date } | { ok: false; error: string } {
  if (!arg) return { ok: false, error: `${flag} <ISO time with zone> is required` };
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.exec(
      arg,
    );
  if (!m) {
    return { ok: false, error: `not an ISO time with a zone (e.g. 2026-11-10T09:30:00Z): ${arg}` };
  }
  // Optional groups (seconds) are undefined at run time, whatever RegExpExecArray's type says.
  const [y, mo, d, h, mi, sec] = (m.slice(1) as (string | undefined)[]).map((x) =>
    x === undefined ? 0 : Number(x),
  );
  // Date rolls 30 Feb over to 2 Mar; check the calendar fields ourselves.
  const day = new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 0));
  const at = new Date(arg);
  if (
    Number.isNaN(at.getTime()) ||
    day.getUTCMonth() !== (mo ?? 0) - 1 ||
    day.getUTCDate() !== d ||
    (h ?? 0) > 23 ||
    (mi ?? 0) > 59 ||
    (sec ?? 0) > 59
  ) {
    return { ok: false, error: `not a valid time: ${arg}` };
  }
  if (at.getTime() > now.getTime()) return { ok: false, error: `in the future: ${arg}` };
  return { ok: true, at };
}
