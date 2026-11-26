import type { FlightDetails, TicketDetails } from './ticketParse';
import { zonedToInstant } from './time';
import type { FlightLeg, Trip } from './types';

/**
 * Landing times for journeys that don't have them yet, read off the tickets
 * already saved on the trip: "6E328 lands 20:05" fills in when the way
 * home lands, so the ride home can be planned, and "6E7414 lands 15:05"
 * when there's a connection to catch. Flights are found by number and day. Times someone
 * typed in are never changed. Undefined when there was nothing to fill.
 */
export function fillLandings(trip: Trip, readings: TicketDetails[]): Trip | undefined {
  const flights: FlightDetails[] = readings.flatMap((d) => [
    d,
    ...(d.connections ?? []),
    ...(d.returnFlight ? [d.returnFlight, ...(d.returnFlight.connections ?? [])] : []),
  ]);
  let changed = false;
  const arrival = (x: { departure: string; flightNumber?: string }) =>
    flights.find(
      (f) =>
        f.arrival &&
        f.departure?.slice(0, 10) === x.departure.slice(0, 10) &&
        (x.flightNumber ? norm(f.flightNumber) === norm(x.flightNumber) : f.departure === x.departure),
    )?.arrival;
  const fill = <T extends FlightLeg | null | undefined>(leg: T): T => {
    if (!leg) return leg;
    const cs = leg.connections ?? [];
    let next: FlightLeg = leg;
    const last = cs.length ? cs[cs.length - 1] : leg;
    const lands = next.lands ?? arrival(last);
    if (lands !== next.lands) next = { ...next, lands };
    if (cs.length > 0) {
      // Each flight before the last: when it lands, to catch the next one.
      const arrives = next.arrives ?? arrival(leg);
      if (arrives !== next.arrives) next = { ...next, arrives };
      const connections = cs.map((c, i) => (i === cs.length - 1 || c.arrives ? c : { ...c, arrives: arrival(c) }));
      if (connections.some((c, i) => c.arrives !== cs[i].arrives)) next = { ...next, connections };
    }
    if (next !== leg) changed = true;
    return next as T;
  };
  const next: Trip = { ...trip, flight: fill(trip.flight), returnFlight: fill(trip.returnFlight) };
  if (trip.personFlights) {
    next.personFlights = Object.fromEntries(
      Object.entries(trip.personFlights).map(([id, p]) => [id, { ...p, flight: fill(p.flight), returnFlight: fill(p.returnFlight) }]),
    );
  }
  return changed ? next : undefined;
}

/**
 * True when some journey on the trip is missing a landing time and hasn't
 * landed: its last flight left less than a day ago, or is still to come.
 * (A flight in the air counts: that's when the ride from the airport matters.)
 */
export function needsLandings(trip: Trip, now: Date = new Date()): boolean {
  const legs = [trip.flight, trip.returnFlight, ...Object.values(trip.personFlights ?? {}).flatMap((p) => [p.flight, p.returnFlight])];
  return legs.some((l) => {
    if (!l) return false;
    const cs = l.connections ?? [];
    const missing = !l.lands || (cs.length > 0 && (!l.arrives || cs.slice(0, -1).some((c) => !c.arrives)));
    if (!missing) return false;
    const last = cs.length ? cs[cs.length - 1] : l;
    return zonedToInstant(last.departure, last.timeZone).getTime() > now.getTime() - DAY_MS;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

const norm = (n?: string) => n?.replace(/\s+/g, '').toUpperCase();
