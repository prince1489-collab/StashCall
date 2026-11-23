import { AIRPORTS, type Airport } from './airports';
import type { LocalDateTime } from './types';

/**
 * What we could read from a ticket, boarding pass or booking screenshot.
 * Every field is a best guess: the trip form shows them for the user to check.
 */
export interface TicketDetails {
  flightNumber?: string;
  from?: Airport;
  to?: Airport;
  /** Departure, in the departure airport's wall-clock time. */
  departure?: LocalDateTime;
  /** Hotel checkout, in the hotel's wall-clock time. */
  checkout?: LocalDateTime;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORD = '(?:st|nd|rd|th)?';

const pad = (n: number) => String(n).padStart(2, '0');

interface Found<T> {
  index: number;
  end: number;
  value: T;
}

/** A calendar day, year possibly unknown. */
interface Day {
  y?: number;
  m: number;
  d: number;
}

function monthOf(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

function validDay({ m, d }: Day): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** Every date written in a way tickets commonly use, in text order. */
export function findDates(text: string): Found<Day>[] {
  const out: Found<Day>[] = [];
  const add = (m: RegExpExecArray, day: Day) => {
    if (validDay(day)) out.push({ index: m.index, end: m.index + m[0].length, value: day });
  };
  const year = (s?: string) => (s ? Number(s.length === 2 ? `20${s}` : s) : undefined);

  // 19 February 2027, 19 Feb, 19FEB, 19-Feb-27
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})${ORD}[\\s\\-]*${MONTH}\\b\\.?(?:[\\s,\\-]*(\\d{4}|\\d{2}(?![:.]?\\d)))?`, 'gi'))) {
    add(m as RegExpExecArray, { d: Number(m[1]), m: monthOf(m[2]), y: year(m[3]) });
  }
  // February 19, 2027
  for (const m of text.matchAll(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})${ORD}\\b(?:,?\\s*(\\d{4}))?`, 'gi'))) {
    add(m as RegExpExecArray, { d: Number(m[2]), m: monthOf(m[1]), y: year(m[3]) });
  }
  // 2027-02-19
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    add(m, { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) });
  }
  // 19/02/2027 or 19.02.2027, day first as in the UK and India
  for (const m of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g)) {
    add(m, { d: Number(m[1]), m: Number(m[2]), y: year(m[3]) });
  }
  // Overlapping matches ("Feb 19, 2027" inside "19 Feb ..."): keep the earliest, longest.
  out.sort((a, b) => a.index - b.index || b.end - a.end);
  return out.filter((f, i) => i === 0 || f.index >= out[i - 1].end);
}

/** Every time of day like 02:15, 2.15 pm or 14h30, in text order, as "HH:mm". */
export function findTimes(text: string): Found<string>[] {
  const out: Found<string>[] = [];
  for (const m of text.matchAll(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b(?:\s*([ap])\.?\s?m\b\.?)?/gi)) {
    let h = Number(m[1]);
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'p' && h < 12) h += 12;
    if (ampm === 'a' && h === 12) h = 0;
    out.push({ index: m.index, end: m.index + m[0].length, value: `${pad(h)}:${m[2]}` });
  }
  return out;
}

/** The line of `text` that contains position `index`. */
function lineAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? undefined : end);
}

/** A day with no year is the next one on or after `today`. */
function withYear(day: Day, today: Date): Day {
  if (day.y) return day;
  const y = today.getFullYear();
  const thisYear = new Date(y, day.m - 1, day.d);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return { ...day, y: thisYear < startOfToday ? y + 1 : y };
}

const local = (day: Day, time: string): LocalDateTime => `${day.y}-${pad(day.m)}-${pad(day.d)}T${time}`;

/** Times that are about something other than take-off. */
const NOT_DEPARTURE = /board|gate|arriv|land|check[\s-]?in|duration|clos/i;

function findFlightNumber(text: string): string | undefined {
  const all = [...text.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/g)].filter(
    (m) => !/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1]),
  );
  // Prefer one next to the word "flight", then any with a two-letter code.
  const near = all.find((m) => /flight/i.test(lineAt(text, m.index)));
  const best = near ?? all.find((m) => /^[A-Z]{2}$/.test(m[1])) ?? all[0];
  return best ? `${best[1]}${best[2]}` : undefined;
}

function findAirports(text: string): Airport[] {
  const seen: Airport[] = [];
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    const a = AIRPORTS[m[1]];
    if (a && !seen.some((s) => s.code === a.code)) seen.push(a);
  }
  return seen;
}

function findCheckout(text: string, today: Date): LocalDateTime | undefined {
  const m = /check[\s-]?out/i.exec(text);
  if (!m) return undefined;
  const after = text.slice(m.index, m.index + 160);
  const date = findDates(after)[0];
  if (!date) return undefined;
  // "Check-out: Sun 21 Feb 2027, until 11:00"; most hotels say 11:00 or 12:00.
  const time = findTimes(after.slice(date.end)).find((t) => t.index < 60)?.value ?? '11:00';
  return local(withYear(date.value, today), time);
}

/**
 * Reads flight and hotel details out of the text found on a screenshot.
 * Text comes from on-device OCR, so lines may be out of order or split.
 */
export function parseTicketText(blocks: string[], today: Date = new Date()): TicketDetails {
  const text = blocks.join('\n');
  const details: TicketDetails = {};

  const airports = findAirports(text);
  if (airports[0]) details.from = airports[0];
  if (airports[1]) details.to = airports[1];

  // Departure: the first date, then the first time after it that isn't a
  // boarding, gate or arrival time. Look at the part before "Arrives" first.
  const flightText = text.replace(/check[\s-]?out[\s\S]*$/i, '');
  const date = findDates(flightText)[0];
  if (date) {
    const arrives = flightText.search(/\barriv/i);
    const candidates = findTimes(flightText).filter(
      (t) => t.index >= date.index - 40 && !NOT_DEPARTURE.test(lineAt(flightText, t.index)),
    );
    const time =
      candidates.find((t) => arrives === -1 || t.index < arrives || arrives < date.index) ?? candidates[0];
    const isFlight = time && (airports.length > 0 || /flight|depart|boarding|gate|seat/i.test(flightText));
    if (isFlight) details.departure = local(withYear(date.value, today), time.value);
  }
  if (details.departure) details.flightNumber = findFlightNumber(flightText);

  const checkout = findCheckout(text, today);
  if (checkout) details.checkout = checkout;
  return details;
}

/** True when there's enough to plan a trip around. */
export function hasTripDetails(d: TicketDetails): boolean {
  return !!(d.departure || d.checkout);
}

/** "London in February", or a plainer name when we don't know the city. */
export function suggestTripName(d: TicketDetails): string {
  const when = d.departure ?? d.checkout;
  const month = when
    ? new Date(Number(when.slice(0, 4)), Number(when.slice(5, 7)) - 1, 1).toLocaleString('en-GB', { month: 'long' })
    : '';
  if (d.to) return month ? `${d.to.city} in ${month}` : d.to.city;
  if (d.flightNumber) return `Flight ${d.flightNumber}`;
  return month ? `Trip in ${month}` : 'My trip';
}

/** One line for the user, e.g. "BA138 · BOM → LHR · Fri 19 Feb, 02:15". */
export function describeTicket(d: TicketDetails, formatDay: (local: LocalDateTime) => string): string {
  const parts: string[] = [];
  if (d.flightNumber) parts.push(d.flightNumber);
  if (d.from && d.to) parts.push(`${d.from.code} → ${d.to.code}`);
  else if (d.from) parts.push(`from ${d.from.code}`);
  if (d.departure) parts.push(`${formatDay(d.departure)}, ${d.departure.slice(11)}`);
  if (d.checkout) parts.push(`checkout ${formatDay(d.checkout)}, ${d.checkout.slice(11)}`);
  return parts.join(' · ');
}
