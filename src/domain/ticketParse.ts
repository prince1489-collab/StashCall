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
  /** The flight home, when the booking has one. */
  returnFlight?: Pick<TicketDetails, 'flightNumber' | 'from' | 'to' | 'departure'>;
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

/**
 * OCR often reads the 0 in "02:15" as the letter O, or 1 as I or l. Fix
 * those inside anything shaped like a time, so the time isn't missed.
 */
export function fixOcrDigits(text: string): string {
  const digit = (c: string) => (/[Oo]/.test(c) ? '0' : /[Il|]/.test(c) ? '1' : c);
  return text.replace(/(?<![\w:])([0-9OoIl|]{1,2})([:.])([0-9OoIl|]{2})(?![\w:])/g, (m, h: string, sep: string, mm: string) =>
    /\d/.test(h + mm) ? `${[...h].map(digit).join('')}${sep}${[...mm].map(digit).join('')}` : m,
  );
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
  const text = fixOcrDigits(blocks.join('\n'));
  const flightText = text.replace(/check[\s-]?out[\s\S]*$/i, '');

  // A booking with an outbound and a return flight lists two flight numbers.
  // Read each part on its own, then take the earliest as the outbound.
  const flights = splitByFlight(flightText)
    .map((part) => parseFlight(part, today))
    .filter((f): f is FlightDetails => !!f.departure)
    .sort((a, b) => (a.departure! < b.departure! ? -1 : 1));

  const details: TicketDetails = {};
  if (flights.length >= 2) {
    // Connections leave within a day of the flight before; the flight home
    // is the first one after a longer gap, and only counts if the booking
    // ends back where it started (LHR → DXB → BOM is one way, not a return).
    const gap = flights.findIndex((f, i) => i > 0 && hoursBetween(flights[i - 1].departure!, f.departure!) >= 24);
    const outbound = gap === -1 ? flights : flights.slice(0, gap);
    const last = flights[flights.length - 1];
    const endsHome = !last.to || !flights[0].from || last.to.city === flights[0].from.city;
    Object.assign(details, flights[0]);
    // Name the trip after the final stop, not the connecting airport.
    const arrival = outbound[outbound.length - 1].to;
    if (arrival) details.to = arrival;
    if (gap !== -1 && endsHome) details.returnFlight = flights[gap];
  } else {
    Object.assign(details, parseFlight(flightText, today));
  }

  const checkout = findCheckout(text, today);
  if (checkout) details.checkout = checkout;
  return details;
}

function hoursBetween(a: LocalDateTime, b: LocalDateTime): number {
  return (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 36e5;
}

/** One flight's worth of details. */
export type FlightDetails = Pick<TicketDetails, 'flightNumber' | 'from' | 'to' | 'departure'>;

/** Airline codes that contain a digit: IndiGo, Go First, AirAsia India, easyJet, Wizz, JetBlue, Frontier, Cebu, Jet. */
const DIGIT_AIRLINES = new Set(['6E', 'G8', 'I5', 'U2', 'W6', 'B6', 'F9', '5J', '9W']);

/**
 * Splits text at each distinct flight number ("BA137 … BA138 …"). Returns
 * the whole text when there's one flight or none.
 */
function splitByFlight(text: string): string[] {
  const seen = new Set<string>();
  const starts: number[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2}|[A-Z0-9]{2})\s?(\d{1,4})\b/g)) {
    const code = `${m[1]}${m[2]}`;
    // Airline codes with a digit ("6E" IndiGo) only from a known list, so
    // "T1 06:10" (terminal 1) isn't read as a flight.
    if (/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1])) continue;
    if (/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1]) || seen.has(code)) continue;
    seen.add(code);
    starts.push(m.index);
  }
  if (starts.length < 2) return [text];
  return starts.map((start, i) => text.slice(i === 0 ? 0 : start, starts[i + 1] ?? text.length));
}

function parseFlight(flightText: string, today: Date): FlightDetails {
  const details: FlightDetails = {};
  const airports = findAirports(flightText);
  if (airports[0]) details.from = airports[0];
  if (airports[1]) details.to = airports[1];

  // Departure: the first date, then the first time after it that isn't a
  // boarding, gate or arrival time. Look at the part before "Arrives" first.
  const date = findDates(flightText)[0];
  if (date) {
    const arrives = flightText.search(/\barriv/i);
    // "19.02.2027" also looks like the time 19:02, so skip times inside a date.
    const dates = findDates(flightText);
    const insideDate = (t: Found<string>) => dates.some((f) => t.index < f.end && t.end > f.index);
    const candidates = findTimes(flightText).filter(
      (t) => t.index >= date.index - 40 && !insideDate(t) && !NOT_DEPARTURE.test(lineAt(flightText, t.index)),
    );
    const time =
      candidates.find((t) => arrives === -1 || t.index < arrives || arrives < date.index) ?? candidates[0];
    const isFlight = time && (airports.length > 0 || /flight|depart|boarding|gate|seat/i.test(flightText));
    if (isFlight) details.departure = local(withYear(date.value, today), time.value);
  }
  if (details.departure) details.flightNumber = findFlightNumber(flightText);
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
  if (d.returnFlight?.departure)
    parts.push(`home ${d.returnFlight.flightNumber ?? ''} ${formatDay(d.returnFlight.departure)}, ${d.returnFlight.departure.slice(11)}`.replace('  ', ' '));
  if (d.checkout) parts.push(`checkout ${formatDay(d.checkout)}, ${d.checkout.slice(11)}`);
  return parts.join(' · ');
}
