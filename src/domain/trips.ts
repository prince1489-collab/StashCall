import { buildTimeline } from './timeline';
import type { Trip } from './types';

/** When a trip's plan starts and ends: its first and last step. Undefined for a trip with no times yet. */
export function tripSpan(trip: Trip): { start: Date; end: Date } | undefined {
  const steps = buildTimeline(trip);
  if (steps.length === 0) return undefined;
  return { start: steps[0].at, end: steps[steps.length - 1].at };
}

/** Trips with something still to come, soonest first. Trips with no times yet go last. */
export function upcomingTrips(trips: Trip[], now: Date): Trip[] {
  return trips
    .map((t) => ({ t, span: tripSpan(t) }))
    .filter(({ span }) => !span || span.end.getTime() >= now.getTime())
    .sort((a, b) => (a.span?.start.getTime() ?? Infinity) - (b.span?.start.getTime() ?? Infinity))
    .map(({ t }) => t);
}

/** Trips that are over, most recent first. */
export function pastTrips(trips: Trip[], now: Date): Trip[] {
  return trips
    .map((t) => ({ t, span: tripSpan(t) }))
    .filter(({ span }) => !!span && span.end.getTime() < now.getTime())
    .sort((a, b) => b.span!.end.getTime() - a.span!.end.getTime())
    .map(({ t }) => t);
}

/**
 * The trip the app should open on: the next one coming up, or the latest
 * that's over when nothing is planned.
 */
export function nextTrip(trips: Trip[], now: Date): Trip | undefined {
  return upcomingTrips(trips, now)[0] ?? pastTrips(trips, now)[0] ?? trips[0];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The travel days: out, and home when known. Wall-clock dates, "2026-12-06". */
export function tripDays(trip: Trip): { from?: string; to?: string } {
  const from = (trip.flight?.departure ?? trip.checkout?.checkout)?.slice(0, 10);
  const to = (trip.returnFlight?.departure ?? (trip.flight ? trip.checkout?.checkout : undefined))?.slice(0, 10);
  return { from, to: to && to !== from ? to : undefined };
}

/** "6–8 Dec", "28 Feb – 3 Mar", "18 Feb 2027": the year only when it isn't `thisYear`. */
export function formatTripDays(trip: Trip, thisYear: number): string {
  const { from, to } = tripDays(trip);
  if (!from) return 'No date yet';
  const part = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, d: Number(d.slice(8, 10)) });
  const a = part(from);
  const b = to ? part(to) : undefined;
  const year = (y: number) => (y === thisYear ? '' : ` ${y}`);
  if (!b) return `${a.d} ${MONTH_SHORT[a.m]}${year(a.y)}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTH_SHORT[a.m]}${year(b.y)}`;
  if (a.y === b.y) return `${a.d} ${MONTH_SHORT[a.m]} – ${b.d} ${MONTH_SHORT[b.m]}${year(b.y)}`;
  return `${a.d} ${MONTH_SHORT[a.m]}${year(a.y)} – ${b.d} ${MONTH_SHORT[b.m]}${year(b.y)}`;
}

/** "Pantnagar in December": named after where the journey ends, or undefined without a destination. */
export function autoTripName(flight: Trip['flight'], cityOf: (code: string) => string | undefined): string | undefined {
  if (!flight?.destination) return undefined;
  const city = cityOf(flight.destination);
  if (!city) return undefined;
  return `${city} in ${MONTH_LONG[Number(flight.departure.slice(5, 7)) - 1]}`;
}

/**
 * True when `name` is one StashCall made up rather than one the user typed:
 * "Delhi in December" for a journey that stops in Delhi, or "My trip". Those
 * follow the journey when it changes.
 */
export function isAutoName(name: string, flight: Trip['flight'], cityOf: (code: string) => string | undefined): boolean {
  const n = name.trim();
  if (!n || n === 'My trip') return true;
  if (!flight) return false;
  const month = MONTH_LONG[Number(flight.departure.slice(5, 7)) - 1];
  if (n === `Trip in ${month}` || (flight.flightNumber && n === `Flight ${flight.flightNumber}`)) return true;
  const stops = [...(flight.connections ?? []).flatMap((c) => [c.airport, c.destination]), flight.destination];
  return stops.some((code) => {
    const city = code && cityOf(code);
    return !!city && (n === `${city} in ${month}` || n === city);
  });
}
