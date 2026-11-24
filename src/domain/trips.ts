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
