import { DEFAULTS } from './defaults';
import { addMinutes, dayBefore, timeLabel, zonedToInstant } from './time';
import type { FlightLeg, HotelCheckout, StepKind, TimelineStep, Trip } from './types';

/**
 * Builds the travel-day timeline by working backwards from the fixed points
 * the user gave us (flight departure, hotel checkout).
 *
 * Deterministic on purpose: no AI, no live data. Every derived time is
 * flagged `estimate: true` so the UI can label it and the user can adjust
 * the assumptions behind it.
 */
export function buildTimeline(trip: Pick<Trip, 'flight' | 'checkout'>): TimelineStep[] {
  const steps: TimelineStep[] = [];
  if (trip.flight) steps.push(...flightSteps(trip.flight));
  if (trip.checkout) steps.push(...checkoutSteps(trip.checkout));
  return steps.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function step(
  kind: StepKind,
  title: string,
  at: Date,
  timeZone: string,
  opts: Partial<Pick<TimelineStep, 'estimate' | 'notify' | 'itemMoment'>> = {},
): TimelineStep {
  return {
    kind,
    title,
    at,
    timeZone,
    localTime: timeLabel(at, timeZone),
    estimate: opts.estimate ?? true,
    notify: opts.notify ?? false,
    itemMoment: opts.itemMoment,
  };
}

export function flightSteps(f: FlightLeg): TimelineStep[] {
  const tz = f.timeZone;
  const takeoff = zonedToInstant(f.departure, tz);
  const airport = addMinutes(takeoff, -f.bufferMinutes);
  const leave = addMinutes(airport, -f.travelMinutes);
  const leaveCheck = addMinutes(leave, -DEFAULTS.leaveCheckMinutesBefore);
  const wake = addMinutes(leave, -f.getReadyMinutes);

  let pack = zonedToInstant(`${dayBefore(f.departure)}T${f.packTime}`, tz);
  // Very early or late flights: never ask to pack after waking up.
  if (pack.getTime() >= wake.getTime()) pack = addMinutes(wake, -60);

  return [
    step('pack', 'Pack your items', pack, tz, { notify: true, itemMoment: 'home' }),
    step('wake', 'Wake up', wake, tz, { notify: true }),
    step('leaveCheck', 'Last check before you leave', leaveCheck, tz, {
      notify: true,
      itemMoment: 'home',
    }),
    step('leave', 'Leave home', leave, tz, { notify: true }),
    step('airport', 'Arrive at the airport', airport, tz),
    step('takeoff', 'Flight departs', takeoff, tz, { estimate: false }),
  ];
}

export function checkoutSteps(c: HotelCheckout): TimelineStep[] {
  const tz = c.timeZone;
  const checkout = zonedToInstant(c.checkout, tz);
  const sweep = addMinutes(checkout, -c.sweepMinutesBefore);
  return [
    step('sweep', 'Sweep the room', sweep, tz, { notify: true, itemMoment: 'checkout' }),
    step('checkout', 'Hotel checkout', checkout, tz, { estimate: false }),
  ];
}

/** Sensible starting values for a new flight, all editable. */
export function defaultFlight(
  departure: string,
  timeZone: string,
  international: boolean,
): FlightLeg {
  return {
    departure,
    timeZone,
    international,
    travelMinutes: DEFAULTS.travelMinutes,
    bufferMinutes: international
      ? DEFAULTS.bufferMinutesInternational
      : DEFAULTS.bufferMinutesDomestic,
    getReadyMinutes: DEFAULTS.getReadyMinutes,
    packTime: DEFAULTS.packTime,
  };
}
