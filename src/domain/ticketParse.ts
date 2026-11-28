import { zonedToInstant } from './time';
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
  /** When it lands, in the arrival airport's wall-clock time, if the ticket says. */
  arrival?: LocalDateTime;
  /** Hotel checkout, in the hotel's wall-clock time. */
  checkout?: LocalDateTime;
  /** Departure terminal, e.g. "T1". */
  terminal?: string;
  /** Later flights on the same journey: Delhi → Pantnagar after Udaipur → Delhi. */
  connections?: FlightDetails[];
  /** The flight home, when the booking has one, with its own connections. */
  returnFlight?: FlightDetails & { connections?: FlightDetails[] };
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
  // 30-11-2026, day first, as on Indian e-tickets. A full year only, so a
  // phone number or a fare isn't read as a date.
  for (const m of text.matchAll(/\b(\d{1,2})-(\d{1,2})-(\d{4})\b/g)) {
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

/** Whether a saved number is shaped like a flight: "6E328", "QP1111", not "G57". */
export function isFlightNumber(s: string): boolean {
  const m = /^([A-Z]{2}|[A-Z]\d|\d[A-Z])\d{1,4}$/.exec(s.replace(/[\s-]/g, '').toUpperCase());
  return !!m && !(/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1]));
}

function findFlightNumber(text: string): string | undefined {
  const all = [...text.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])(?:\s?-\s?|\s?)(\d{1,4})\b/g)].filter(
    // Codes with a digit ("6E" IndiGo) only from the known list: "G57" is not a flight.
    (m) => !/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1]) && !(/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1])),
  );
  // Prefer one next to the word "flight", then any with a two-letter code.
  const near = all.find((m) => /flight/i.test(lineAt(text, m.index)));
  const best = near ?? all.find((m) => /^[A-Z]{2}$/.test(m[1])) ?? all[0];
  return best ? `${best[1]}${best[2]}` : misreadFlightNumber(text);
}

/**
 * A number the phone misread next to an airline's name: "Akasa Air QP -11n"
 * is QP1111. OCR reads 1 as l, I or |, two 1s run together as n, and 0 as O.
 */
function misreadFlightNumber(text: string): string | undefined {
  const AIRLINE = /\b(air|airways|airlines|indigo|akasa|vistara|spicejet|emirates|qatar|etihad)\b/i;
  for (const m of text.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?\s?([0-9lI|Oon]{2,6})\b/g)) {
    if (!AIRLINE.test(lineAt(text, m.index)) || !/\d/.test(m[2])) continue;
    if (/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1])) continue;
    const digits = m[2].replace(/n/g, '11').replace(/[lI|]/g, '1').replace(/[Oo]/g, '0');
    if (/^\d{1,4}$/.test(digits)) return `${m[1]}${digits}`;
  }
  return undefined;
}

/** The first airport listed for each city: "Delhi" → DEL. */
const BY_CITY = new Map<string, Airport>();
for (const a of Object.values(AIRPORTS)) if (!BY_CITY.has(a.city.toLowerCase())) BY_CITY.set(a.city.toLowerCase(), a);
const CITY = new RegExp(`\\b(${[...BY_CITY.keys()].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

/**
 * Airports in the order they appear, by code ("DEL") or, when a booking
 * only names cities ("Delhi (T1)" on IndiGo), by city.
 */
function findAirports(text: string): Airport[] {
  const seen: Airport[] = [];
  for (const { airport } of airportHits(text)) {
    if (!seen.some((s) => s.code === airport.code)) seen.push(airport);
  }
  return seen;
}

/** Every airport named, in order, repeats included, with where it ends. */
function airportHits(text: string): { index: number; end: number; airport: Airport }[] {
  const hits: { index: number; end: number; airport: Airport }[] = [];
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    const a = AIRPORTS[m[1]];
    if (a) hits.push({ index: m.index, end: m.index + m[0].length, airport: a });
  }
  // A city named alongside its code is that airport: "London (LGW)" is Gatwick, not Heathrow.
  const coded = new Map<string, Airport>();
  for (const h of hits) if (!coded.has(h.airport.city)) coded.set(h.airport.city, h.airport);
  for (const m of text.matchAll(CITY)) {
    const a = BY_CITY.get(m[1].toLowerCase());
    if (a) hits.push({ index: m.index, end: m.index + m[0].length, airport: coded.get(a.city) ?? a });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/**
 * A booking table read column by column, as the phone's reader often does
 * with IndiGo's: every date, then every From city, then every departure
 * time, then every flight number. Lines the columns back up into one flight
 * per row. Undefined when the text isn't laid out like that.
 */
function columnFlights(text: string, today: Date): FlightDetails[] | undefined {
  const numbers: { value: string; index: number }[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])(?:\s?-\s?|\s?)(\d{2,4})\b/g)) {
    if (/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1])) continue;
    // "(A321)" is the aircraft: codes with a digit only for known airlines.
    if (/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1])) continue;
    const value = `${m[1]}${m[2]}`;
    if (!numbers.some((n) => n.value === value)) numbers.push({ value, index: m.index });
  }
  const n = numbers.length;
  if (n < 2) return undefined;
  const firstNumber = numbers[0].index;
  const dates = findDates(text).filter((d) => d.index < firstNumber);
  if (dates.length < n) return undefined;
  const depart = text.search(/\bdepart/i);
  if (depart === -1 || depart > firstNumber) return undefined;
  const times = findTimes(text.slice(depart, firstNumber)).slice(0, n);
  if (times.length < n) return undefined;

  // The From and To columns: the cities after each heading.
  const column = (heading: RegExp, until: RegExp) => {
    const start = text.search(heading);
    if (start === -1) return [];
    const rest = text.slice(start);
    const stop = rest.search(until);
    const part = stop === -1 ? rest : rest.slice(0, stop);
    // A code right after its city ("Delhi (T1) DEL") is the same stop.
    return airportHits(part)
      .filter((h, i, all) => i === 0 || !(all[i - 1].airport.code === h.airport.code && h.index - all[i - 1].end < 12))
      .map((h) => ({ airport: h.airport, terminal: /^\s*\(T\s?(\d)\)/.exec(part.slice(h.end))?.[1] }));
  };
  const from = column(/^\s*From\b/im, /\bdepart/i);
  const to = column(/^\s*To\s*$/im, /\barriv/i);
  // Only a real table: From and To headings with a city under each.
  if (from.length === 0 || to.length === 0) return undefined;
  // The Arrives column: its first n times, after the heading.
  const arrivesAt = text.search(/\barriv/i);
  const landings = arrivesAt === -1 ? [] : findTimes(text.slice(arrivesAt)).slice(0, n);

  return numbers.map((num, i) => {
    const f: FlightDetails = {
      flightNumber: num.value,
      departure: local(withYear(dates[i].value, today), times[i].value),
    };
    const a = from[i]?.airport ?? to[i - 1]?.airport;
    const b = to[i]?.airport ?? from[i + 1]?.airport;
    if (a) f.from = a;
    if (b) f.to = b;
    if (from[i]?.terminal) f.terminal = `T${from[i].terminal}`;
    if (landings.length === n) f.arrival = arrivalAfter(f.departure!, landings[i].value, undefined, undefined, { from: f.from?.timeZone, to: f.to?.timeZone });
    return f;
  });
}

/**
 * When the booking was made, not when anyone flies: "30 Oct 26 11:12:20
 * (UTC)". Times with seconds are always timestamps like this one.
 */
function dropTimestamps(text: string): string {
  return text
    .replace(new RegExp(`\\b\\d{1,2}[\\s\\-]*${MONTH}[\\s,\\-]*\\d{2,4}\\s+\\d{1,2}:\\d{2}:\\d{2}(?:\\s*\\(UTC\\))?`, 'gi'), ' ')
    .replace(/\b\d{1,2}:\d{2}:\d{2}\b(?:\s*\(UTC\))?/g, ' ');
}

/**
 * When the booking was made, not when anyone flies: "Booked on : 18-Nov-2026
 * 19:21 HRs" would otherwise be read as the departure.
 */
function dropBookedOn(text: string): string {
  return text.replace(
    /\b(?:booked\s+on|booking\s+date|date\s+of\s+(?:booking|issue)|issued?\s+on|issue\s+date|ticketed\s+on)\b[^\n]*/gi,
    (m) => {
      // Blank out the label, its date and a time right after that date:
      // nothing further, as a departure can follow on the same line.
      const date = findDates(m).find((d) => d.index < 25);
      if (!date) return m;
      const time = /^\s*,?\s*(?:at\s+)?\d{1,2}[:.]\d{2}(?:\s*(?:hrs|[ap]\.?m\.?))?\b/i.exec(m.slice(date.end));
      const end = date.end + (time ? time[0].length : 0);
      return ' '.repeat(end) + m.slice(end);
    },
  );
}

/**
 * The small print after an itinerary ("Points to remember", "Terms and
 * conditions") mentions other places and dates: "travel to and from Dubai".
 * Cut each such section, up to the next flight with a date (a later page's
 * itinerary), once a flight number has come before it.
 */
function dropFinePrint(text: string): string {
  const heading = /\n[^\n]*\b(?:points\s+to\s+remember|terms\s+(?:and|&)\s+conditions|important\s+(?:information|notes?|instructions)|fare\s+rules)\b/gi;
  let out = '';
  let from = 0;
  for (const m of text.matchAll(heading)) {
    if (m.index < from || !findFlightNumber(text.slice(0, m.index))) continue;
    out += text.slice(from, m.index) + '\n';
    from = nextItinerary(text, m.index + m[0].length) ?? text.length;
  }
  return out + text.slice(from);
}

/** Where the next flight number with a date close by starts its line. */
function nextItinerary(text: string, after: number): number | undefined {
  for (const m of text.slice(after).matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])(?:\s?-\s?|\s?)(\d{1,4})\b/g)) {
    if (/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1]) || (/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1]))) continue;
    const at = after + m.index;
    const start = text.lastIndexOf('\n', at) + 1;
    if (findDates(text.slice(start, at + 120)).length > 0) return start;
  }
  return undefined;
}

function findCheckout(text: string, today: Date): LocalDateTime | undefined {
  const m = /check[\s-]?out/i.exec(text);
  if (!m) return undefined;
  const after = text.slice(m.index, m.index + 160);
  const dates = findDates(after);
  // A table with "Check-in  Check-out" headings, then both dates: the later one.
  const table = /check[\s-]?in\W{0,30}$/i.test(text.slice(Math.max(0, m.index - 40), m.index)) && dates.length >= 2;
  const date = table ? dates[1] : dates[0];
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
  const text = dropBookedOn(dropTimestamps(fixOcrDigits(blocks.join('\n'))));
  const flightText = dropFinePrint(text).replace(/check[\s-]?out[\s\S]*$/i, '');

  // A booking with an outbound and a return flight lists two flight numbers.
  // Read each part on its own, then take the earliest as the outbound.
  const flights = (columnFlights(flightText, today) ?? splitByFlight(flightText).map((part) => parseFlight(part, today)))
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
    if (outbound.length > 1) details.connections = outbound.slice(1);
    if (gap !== -1 && endsHome) {
      // The way home, with the flights it connects to that day.
      const home = flights.slice(gap);
      const end = home.findIndex((f, i) => i > 0 && hoursBetween(home[i - 1].departure!, f.departure!) >= 24);
      const legs = end === -1 ? home : home.slice(0, end);
      details.returnFlight = { ...legs[0], ...(legs.length > 1 && { to: legs[legs.length - 1].to ?? legs[0].to, connections: legs.slice(1) }) };
    }
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
export interface FlightDetails {
  flightNumber?: string;
  from?: Airport;
  to?: Airport;
  departure?: LocalDateTime;
  /** When it lands, in the arrival airport's time, if the ticket says. */
  arrival?: LocalDateTime;
  terminal?: string;
}

/**
 * A landing time with no date of its own: the first day on which it comes
 * after take-off, judged in each airport's own time zone when we know them,
 * so a flight west that lands "earlier" on the clock stays on the same day.
 */
function arrivalAfter(
  departure: LocalDateTime,
  time: string,
  day?: Day,
  today?: Date,
  zones?: { from?: string; to?: string },
): LocalDateTime {
  if (day && today) return local(withYear(day, today), time);
  const date = departure.slice(0, 10);
  const shift = (n: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return `${d.toISOString().slice(0, 10)}T${time}`;
  };
  if (zones?.from && zones.to) {
    const off = zonedToInstant(departure, zones.from).getTime();
    for (const n of [-1, 0, 1, 2]) {
      const at = zonedToInstant(shift(n), zones.to).getTime();
      // Flights take under a day; the first landing after take-off.
      if (at > off) return shift(n);
    }
  }
  return time >= departure.slice(11, 16) ? shift(0) : shift(1);
}

/** Airline codes that contain a digit: IndiGo, Go First, AirAsia India, easyJet, Wizz, JetBlue, Frontier, Cebu, Jet. */
const DIGIT_AIRLINES = new Set(['6E', 'G8', 'I5', 'U2', 'W6', 'B6', 'F9', '5J', '9W']);

/**
 * Splits text at each distinct flight number ("BA137 … BA138 …"). Returns
 * the whole text when there's one flight or none.
 */
function splitByFlight(text: string): string[] {
  const seen = new Set<string>();
  const starts: number[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2}|[A-Z0-9]{2})(?:\s?-\s?|\s?)(\d{1,4})\b/g)) {
    const code = `${m[1]}${m[2]}`;
    // Airline codes with a digit ("6E" IndiGo) only from a known list, so
    // "T1 06:10" (terminal 1) isn't read as a flight.
    if (/\d/.test(m[1]) && !DIGIT_AIRLINES.has(m[1])) continue;
    if (/^(AM|PM|NO|TO|OF|ON|AT|IN|BY)$/.test(m[1]) || seen.has(code)) continue;
    seen.add(code);
    starts.push(m.index);
  }
  if (starts.length < 2) return [text];
  // Tables like IndiGo's put each flight's date, airport and time before its
  // flight number: then split at the dates instead, one per flight.
  const dates = findDates(text);
  const cuts = dates.length === starts.length && dates[0].index < starts[0] ? dates.map((d) => d.index) : starts;
  return cuts.map((start, i) => text.slice(i === 0 ? 0 : start, cuts[i + 1] ?? text.length));
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
    if (isFlight) {
      details.departure = local(withYear(date.value, today), time.value);
      // Landing: the next time after take-off that isn't boarding, a gate or
      // check-in, with its own date when one sits just before it.
      const after = findTimes(flightText).filter(
        (t) =>
          t.index > time.index &&
          t.value !== time.value &&
          !insideDate(t) &&
          !/board|gate|check[\s-]?in|clos|depart|duration/i.test(lineAt(flightText, t.index)),
      )[0];
      if (after) {
        const day = dates.filter((d) => d.index > time.index && d.end <= after.index).pop();
        details.arrival = arrivalAfter(details.departure, after.value, day?.value, today, { from: details.from?.timeZone, to: details.to?.timeZone });
      }
    }
  }
  if (details.departure) {
    details.flightNumber = findFlightNumber(flightText);
    // The first terminal named is where it leaves from: "Delhi (T1)",
    // "Terminal 5", "Terminal: T-2". Not one at the destination, as in
    // "Pantnagar 13:20 … Delhi (T1)".
    const toCity = details.to?.city.toLowerCase();
    for (const t of flightText.matchAll(/(\S+)\s*\(T\s?(\d)\)|\bTerminal\s*:?\s*(?:T\s?-?\s?)?(\d)\b/gi)) {
      if (t[1] && toCity && toCity.split(/\s+/).pop() === t[1].toLowerCase()) continue;
      details.terminal = `T${t[2] ?? t[3]}`;
      break;
    }
  }
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
