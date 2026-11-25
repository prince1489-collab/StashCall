import { DEFAULTS } from './defaults';
import { suggestTripName, type FlightDetails, type TicketDetails } from './ticketParse';
import { zonedToInstant } from './time';
import { defaultFlight } from './timeline';
import type { Connection, FlightLeg, HotelCheckout, Trip } from './types';

export interface TripDraft {
  name: string;
  flight?: FlightLeg;
  checkout?: HotelCheckout;
  returnFlight?: FlightLeg;
}

/**
 * Turns what was read off a ticket into trip form values. The departure is in
 * the departure airport's zone when we know the airport, else `fallbackZone`.
 * A hotel zone taken from the arrival airport counts as chosen.
 */
export function draftFromTicket(d: TicketDetails, fallbackZone: string): TripDraft {
  const flight = d.departure ? flightLeg(d, fallbackZone) : undefined;
  const checkout: HotelCheckout | undefined = d.checkout
    ? {
        checkout: d.checkout,
        timeZone: d.to?.timeZone ?? fallbackZone,
        sweepMinutesBefore: DEFAULTS.sweepMinutesBefore,
        timeZoneConfirmed: !!d.to,
      }
    : undefined;
  const returnFlight = d.returnFlight?.departure
    ? flightLeg(d.returnFlight, checkout?.timeZone ?? fallbackZone, !!checkout?.timeZoneConfirmed)
    : undefined;
  return { name: suggestTripName(d), flight, checkout, returnFlight };
}

/**
 * A flight from what was read. Its zone is the departure airport's when we
 * know the airport (then it counts as confirmed), else `fallbackZone`.
 */
export function flightLeg(
  f: FlightDetails & { connections?: FlightDetails[] },
  fallbackZone: string,
  fallbackConfirmed = false,
): FlightLeg {
  const international = f.from && f.to ? f.from.country !== f.to.country : true;
  const zone = f.from?.timeZone ?? fallbackZone;
  const connections = (f.connections ?? [])
    .filter((c) => c.departure)
    .map(
      (c): Connection => ({
        departure: c.departure!,
        timeZone: c.from?.timeZone ?? zone,
        ...(c.flightNumber && { flightNumber: c.flightNumber }),
        ...(c.from && { airport: c.from.code }),
        ...(c.to && { destination: c.to.code }),
        ...(c.terminal && { terminal: c.terminal }),
      }),
    );
  return {
    ...defaultFlight(f.departure!, zone, international),
    airport: f.from?.code,
    destination: f.to?.code,
    timeZoneConfirmed: f.from ? true : fallbackConfirmed,
    ...(f.flightNumber && { flightNumber: f.flightNumber }),
    ...(f.terminal && { terminal: f.terminal }),
    ...(connections.length > 0 && { connections }),
  };
}

/**
 * True when a single flight read off a screenshot looks like the way home
 * for `outbound`: it leaves later, and from where the outbound landed (or
 * we can't tell the airports).
 */
export function isReturnOf(outbound: FlightLeg, f: FlightDetails): boolean {
  if (!f.departure || f.departure <= outbound.departure) return false;
  if (f.from && outbound.destination) return f.from.code === outbound.destination;
  if (f.to && outbound.airport) return f.to.code === outbound.airport;
  return true;
}

/**
 * Someone else's flights for the same trip: a different departure that
 * lands where the trip goes, or leaves within a day of it. Dad's Udaipur
 * flight to Pantnagar joins the trip rather than starting a new one.
 */
export function joinsTrip(trip: Trip, d: TicketDetails): boolean {
  const f = trip.flight;
  if (!f || !d.departure || d.departure === f.departure) return false;
  if (d.to && f.destination && d.to.code === f.destination) return true;
  const day = (x: string) => Date.parse(`${x.slice(0, 10)}T00:00Z`);
  return Math.abs(day(d.departure) - day(f.departure)) <= 86400000;
}

const instant = (f: { departure: string; timeZone: string }) => zonedToInstant(f.departure, f.timeZone).getTime();

/**
 * A journey's first flight as a connection of another. A journey's
 * destination is its final stop, so its first flight lands where its first
 * connection leaves from.
 */
function asConnection(f: FlightLeg): Connection {
  const lands = f.connections?.[0]?.airport ?? f.destination;
  return {
    departure: f.departure,
    timeZone: f.timeZone,
    ...(f.flightNumber && { flightNumber: f.flightNumber }),
    ...(f.airport && { airport: f.airport }),
    ...(lands && { destination: lands }),
    ...(f.terminal && { terminal: f.terminal }),
  };
}

/** Every departure on a journey, as instants. */
const departures = (f: FlightLeg) => [instant(f), ...(f.connections ?? []).map(instant)];

/**
 * Whether `second` carries on from `first`: it leaves from where `first`
 * lands, or the two share a flight (the same booking read twice). A flight
 * with no airports, like the form's made-up one, joins nothing.
 */
function connects(first: FlightLeg, second: FlightLeg): boolean {
  const a = departures(first);
  if (departures(second).some((t) => a.includes(t))) return true;
  return !!first.destination && !!second.airport && first.destination === second.airport;
}

/**
 * Two bookings for one journey, like Udaipur → Delhi and Delhi → Pantnagar
 * on the same day, become one: the day is planned from the first flight, and
 * the later ones are its connections. Flights more than a day apart, or
 * that don't carry on from each other, aren't one journey: the new one
 * replaces the old.
 */
export function joinLegs(had: FlightLeg | null | undefined, read: FlightLeg): FlightLeg {
  if (!had || Math.abs(instant(had) - instant(read)) > 24 * 3600 * 1000) return read;
  const [first, second] = instant(had) <= instant(read) ? [had, read] : [read, had];
  if (!connects(first, second)) return read;
  const all = [...(first.connections ?? []), asConnection(second), ...(second.connections ?? [])];
  // The same flight in both bookings counts once.
  const seen = new Set<number>([instant(first)]);
  const connections = all
    .filter((c) => (seen.has(instant(c)) ? false : (seen.add(instant(c)), true)))
    .sort((a, b) => instant(a) - instant(b));
  const last = connections[connections.length - 1];
  return {
    ...first,
    destination: last?.destination ?? first.destination,
    // Abroad if any flight on the way is.
    international: first.international || second.international,
    ...(connections.length > 0 && { connections }),
  };
}
