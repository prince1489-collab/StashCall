import type { FlightDetails, TicketDetails } from './ticketParse';
import { zonedToInstant } from './time';
import type { FlightLeg, Trip } from './types';

/**
 * Landing times for journeys that don't have one yet, read off the tickets
 * already saved on the trip: "6E328 lands 20:05" fills in when the way
 * home lands, so the ride home can be planned. A journey lands when its
 * last flight does; that flight is found by number and day. Times someone
 * typed in are never changed. Undefined when there was nothing to fill.
 */
export function fillLandings(trip: Trip, readings: TicketDetails[]): Trip | undefined {
  const flights: FlightDetails[] = readings.flatMap((d) => [
    d,
    ...(d.connections ?? []),
    ...(d.returnFlight ? [d.returnFlight, ...(d.returnFlight.connections ?? [])] : []),
  ]);
  let changed = false;
  const fill = <T extends FlightLeg | null | undefined>(leg: T): T => {
    if (!leg || leg.lands) return leg;
    const last = leg.connections?.length ? leg.connections[leg.connections.length - 1] : leg;
    const lands = flights.find(
      (f) =>
        f.arrival &&
        f.departure?.slice(0, 10) === last.departure.slice(0, 10) &&
        (last.flightNumber ? norm(f.flightNumber) === norm(last.flightNumber) : f.departure === last.departure),
    )?.arrival;
    if (!lands) return leg;
    changed = true;
    return { ...leg, lands };
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
 * True when some journey on the trip has no landing time yet and hasn't
 * landed: its last flight left less than a day ago, or is still to come.
 * (A flight in the air counts: that's when the ride from the airport matters.)
 */
export function needsLandings(trip: Trip, now: Date = new Date()): boolean {
  const legs = [trip.flight, trip.returnFlight, ...Object.values(trip.personFlights ?? {}).flatMap((p) => [p.flight, p.returnFlight])];
  return legs.some((l) => {
    if (!l || l.lands) return false;
    const last = l.connections?.length ? l.connections[l.connections.length - 1] : l;
    return zonedToInstant(last.departure, last.timeZone).getTime() > now.getTime() - DAY_MS;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

const norm = (n?: string) => n?.replace(/\s+/g, '').toUpperCase();
