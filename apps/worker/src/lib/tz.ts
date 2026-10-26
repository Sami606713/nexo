/**
 * Minimal IANA time-zone conversion without external deps, using the Intl "offset trick":
 * format an instant in the target zone, re-read the wall-clock parts as if they were UTC,
 * and the difference is the zone's offset at that instant.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: string | null | undefined): timeZone is string {
  if (!timeZone) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `timeZone` from UTC at instant `utcMs`, in ms (e.g. +3_600_000 for UTC+1). */
export function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  // Drop sub-second precision of the input so the difference is a whole number of seconds.
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Convert a wall-clock time in `timeZone` to a UTC Date.
 * - Ambiguous times (DST fall-back) resolve to the FIRST occurrence (the earlier instant).
 * - Non-existent times (DST spring-forward gap) are shifted forward by the gap length
 *   (e.g. 02:30 on a US spring-forward day → 03:30 local).
 * Unknown time zones fall back to UTC.
 */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // Offsets in effect shortly before and after the wall time cover both sides of any transition.
  const offBefore = tzOffsetMs(tz, guess - 24 * 3600_000);
  const offAfter = tzOffsetMs(tz, guess + 24 * 3600_000);
  const candidates = [guess - offBefore, guess - offAfter]
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .filter((t) => t + tzOffsetMs(tz, t) === guess)
    .sort((a, b) => a - b);
  if (candidates.length > 0) return new Date(candidates[0]!);
  // Gap: wall time does not exist. Interpreting it with the pre-transition offset lands
  // after the transition, i.e. the wall time shifted forward by the gap.
  return new Date(guess - offBefore);
}

/** Parse "YYYY-MM-DD" → parts, or null. */
export function parseDate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Parse "HH:mm" (also "H:mm") → parts, or null. */
export function parseTime(s: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** Calendar arithmetic on a date (no time zone involved). */
export function addDays(d: { year: number; month: number; day: number }, days: number) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
