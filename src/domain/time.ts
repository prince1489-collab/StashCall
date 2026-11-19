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
 * For times skipped by a DST jump, returns the instant just after the gap.
 */
export function zonedToInstant(local: LocalDateTime, timeZone: string): Date {
  const { y, mo, d, h, mi } = parseLocal(local);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the offset, including around DST changes.
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60000;
  guess = naive - zoneOffsetMinutes(new Date(guess), timeZone) * 60000;
  return new Date(guess);
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
