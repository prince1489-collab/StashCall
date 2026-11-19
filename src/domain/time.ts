import type { LocalDateTime, LocalTime } from './types';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Splits "YYYY-MM-DDTHH:mm" into numbers, or throws if malformed. */
function parseLocal(local: LocalDateTime) {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Invalid local date-time: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number);
  return { y, mo, d, h, mi };
}

/** Offset of `timeZone` from UTC at instant `at`, in minutes (UTC+1 → 60). */
export function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  const atMinute = Math.floor(at.getTime() / 60000) * 60000;
  return Math.round((asUtc - atMinute) / 60000);
}

/**
 * The instant at which the wall clock in `timeZone` reads `local`.
 *
 * Around clock changes:
 * - a time that happens twice (clocks go back) resolves to the first one;
 * - a time that never happens (clocks go forward) moves forward by the size
 *   of the gap, e.g. 02:30 on a spring-forward night becomes 03:30.
 */
export function zonedToInstant(local: LocalDateTime, timeZone: string): Date {
  const { y, mo, d, h, mi } = parseLocal(local);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Real offsets run from -12 h to +14 h, so sampling 36 h either side of
  // the naive instant is always before and after any clock change near it.
  // Changes are months apart, so no second change falls inside the window.
  const window = 36 * 60 * 60000;
  const offBefore = zoneOffsetMinutes(new Date(naive - window), timeZone);
  const offAfter = zoneOffsetMinutes(new Date(naive + window), timeZone);

  const candidates = [naive - offBefore * 60000, naive - offAfter * 60000]
    .filter((t) => instantToZoned(new Date(t), timeZone) === local)
    .sort((a, b) => a - b);
  if (candidates.length > 0) return new Date(candidates[0]);

  // In a spring-forward gap: reading the time with the pre-change offset
  // lands the same distance past the gap.
  return new Date(naive - offBefore * 60000);
}

/** Wall-clock "YYYY-MM-DDTHH:mm" for an instant in `timeZone`. */
export function instantToZoned(at: Date, timeZone: string): LocalDateTime {
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** "HH:mm" for an instant in `timeZone`. */
export function timeLabel(at: Date, timeZone: string): LocalTime {
  return instantToZoned(at, timeZone).slice(11);
}

/** The calendar day before a "YYYY-MM-DD..." date, as "YYYY-MM-DD". */
export function dayBefore(local: LocalDateTime): string {
  const { y, mo, d } = parseLocal(local);
  return new Date(Date.UTC(y, mo - 1, d - 1)).toISOString().slice(0, 10);
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60000);
}
