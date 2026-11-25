import { flightLeg, joinLegs } from './ticketDraft';
import type { FlightDetails, TicketDetails } from './ticketParse';
import { zonedToInstant } from './time';
import type { FlightLeg, Person } from './types';

/** One flight on a journey, for listing: "07:00 6E 2134 BOM → DEL from T1". */
export interface JourneyFlight {
  departure: string;
  flightNumber?: string;
  from?: string;
  to?: string;
  terminal?: string;
}

/** Every flight on a journey in order: the first, then each connection. */
export function journeyFlights(f: FlightLeg): JourneyFlight[] {
  const cs = f.connections ?? [];
  const first: JourneyFlight = {
    departure: f.departure,
    flightNumber: f.flightNumber,
    from: f.airport,
    to: cs[0]?.airport ?? f.destination,
    terminal: f.terminal,
  };
  return [
    first,
    ...cs.map((c, i) => ({
      departure: c.departure,
      flightNumber: c.flightNumber,
      from: c.airport,
      to: c.destination ?? cs[i + 1]?.airport ?? (i === cs.length - 1 ? f.destination : undefined),
      terminal: c.terminal,
    })),
  ];
}

export interface SortedJourneys {
  /** The way there. */
  flight?: FlightLeg;
  /** The way home: the last journey, when there's more than one. */
  returnFlight?: FlightLeg;
  /** Journeys in between (A → B, then B → C): not planned yet, only counted. */
  between: FlightLeg[];
}

const DAY_MS = 24 * 3600 * 1000;
const at = (f: FlightLeg) => zonedToInstant(f.departure, f.timeZone).getTime();

/** Each single flight a reading holds, outbound and home, connections included. */
function singleFlights(d: TicketDetails): FlightDetails[] {
  const out: FlightDetails[] = [d, ...(d.connections ?? [])];
  const home: FlightDetails[] = d.returnFlight ? [d.returnFlight, ...(d.returnFlight.connections ?? [])] : [];
  return [...out, ...home].filter((f) => !!f.departure);
}

/**
 * Sorts the flights read from any number of screenshots, picked in any
 * order, into journeys. Flights a day or less apart, each leaving from where
 * the last landed, are one journey; a longer gap is a stay. Mumbai → Delhi +
 * Delhi → Mumbai on one booking and Delhi → Pantnagar + Pantnagar → Delhi on
 * another become BOM → DEL → PGH, then PGH → DEL → BOM.
 */
export function sortJourneys(readings: TicketDetails[], fallbackZone: string): SortedJourneys {
  const seen = new Set<string>();
  const legs = readings
    .flatMap(singleFlights)
    .map((f) => flightLeg(f, fallbackZone))
    // The same flight on two screenshots counts once.
    .filter((l) => {
      const key = `${l.departure}|${l.airport ?? ''}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .sort((a, b) => at(a) - at(b));
  const journeys: FlightLeg[] = [];
  for (const leg of legs) {
    const last = journeys[journeys.length - 1];
    const joined = last && at(leg) - at(last) <= DAY_MS ? joinLegs(last, leg) : leg;
    if (last && joined !== leg) journeys[journeys.length - 1] = joined;
    else journeys.push(leg);
  }
  if (journeys.length === 0) return { between: [] };
  if (journeys.length === 1) return { flight: journeys[0], between: [] };
  return { flight: journeys[0], returnFlight: journeys[journeys.length - 1], between: journeys.slice(1, -1) };
}

/**
 * The people a ticket names, by first name as a whole word. A booking for
 * the whole family names everyone; the booker's contact details can add a
 * name too, so only a single name is a sure match.
 */
export function namedOn(text: string | undefined, people: Person[]): Person[] {
  if (!text) return [];
  return people.filter((p) => {
    const first = p.name.trim().split(/\s+/)[0];
    if (!first || first.length < 3) return false;
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${esc}\\b`, 'i').test(text);
  });
}
