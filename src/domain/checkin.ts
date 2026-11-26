import { zonedToInstant } from './time';
import type { FlightLeg, Trip } from './types';

/** How early online check-in opens, and where to do it. */
interface Airline {
  name: string;
  hours: number;
  url?: string;
}

/** Airlines we know, by flight-number code. Others: 24 hours, no link. */
const AIRLINES: Record<string, Airline> = {
  '6E': { name: 'IndiGo', hours: 48, url: 'https://www.goindigo.in/web-check-in.html' },
  QP: { name: 'Akasa Air', hours: 48, url: 'https://www.akasaair.com' },
  AI: { name: 'Air India', hours: 48, url: 'https://www.airindia.com' },
  IX: { name: 'Air India Express', hours: 48, url: 'https://www.airindiaexpress.com' },
  SG: { name: 'SpiceJet', hours: 48, url: 'https://www.spicejet.com' },
  BA: { name: 'British Airways', hours: 24, url: 'https://www.britishairways.com' },
  EK: { name: 'Emirates', hours: 48, url: 'https://www.emirates.com' },
  VS: { name: 'Virgin Atlantic', hours: 24, url: 'https://www.virginatlantic.com' },
};

export interface CheckIn {
  /** When check-in opens for the first of these flights. */
  at: Date;
  airline: string;
  flightNumbers: string[];
  url?: string;
  home: boolean;
}

const codeOf = (n: string) => n.slice(0, 2).toUpperCase();

/**
 * When online check-in opens on each journey, one reminder per airline:
 * QP1111 then 6E7415 on the way there are two check-ins; 6E7414 and 6E328
 * home are one reminder, at the earlier opening. Flights with no number
 * are skipped, since we can't tell the airline.
 */
export function checkIns(trip: Pick<Trip, 'flight' | 'returnFlight'>): CheckIn[] {
  const journey = (f: FlightLeg | undefined, home: boolean): CheckIn[] => {
    if (!f) return [];
    const flights = [f, ...(f.connections ?? [])].filter((x) => x.flightNumber);
    const byCode = new Map<string, CheckIn>();
    for (const x of flights) {
      const code = codeOf(x.flightNumber!);
      const known = AIRLINES[code];
      const opens = new Date(zonedToInstant(x.departure, x.timeZone).getTime() - (known?.hours ?? 24) * 3600 * 1000);
      const had = byCode.get(code);
      if (had) {
        had.flightNumbers.push(x.flightNumber!);
        if (opens < had.at) had.at = opens;
      } else {
        byCode.set(code, { at: opens, airline: known?.name ?? code, flightNumbers: [x.flightNumber!], url: known?.url, home });
      }
    }
    return [...byCode.values()];
  };
  return [...journey(trip.flight, false), ...journey(trip.returnFlight, true)].sort((a, b) => a.at.getTime() - b.at.getTime());
}
