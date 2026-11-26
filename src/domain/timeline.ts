import { DEFAULTS } from './defaults';
import { addMinutes, dayBefore, timeLabel, zonedToInstant } from './time';
import { AIRPORTS } from './airports';
import { journeyCheckIns } from './checkin';
import type { Connection, FlightLeg, HotelCheckout, StepKind, TimelineStep, Trip } from './types';

/** How long before a connecting flight its reminder goes off: time to find the gate, or change terminal. */
const CONNECTION_REMIND_MINUTES = 90;

/**
 * Builds the travel-day timeline by working backwards from the fixed points
 * the user gave us (flight departure, hotel checkout).
 *
 * Deterministic on purpose: no AI, no live data. Every derived time is
 * flagged `estimate: true` so the UI can label it and the user can adjust
 * the assumptions behind it.
 */
export function buildTimeline(trip: Pick<Trip, 'flight' | 'checkout' | 'returnFlight'>): TimelineStep[] {
  const steps: TimelineStep[] = [];
  if (trip.flight) steps.push(...flightSteps(trip.flight));
  if (trip.checkout) steps.push(...checkoutSteps(trip.checkout));
  if (trip.returnFlight) steps.push(...returnFlightSteps(trip.returnFlight));
  return steps.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function step(
  kind: StepKind,
  title: string,
  at: Date,
  timeZone: string,
  opts: Partial<Pick<TimelineStep, 'estimate' | 'notify' | 'itemMoment' | 'remindAt' | 'detail' | 'link'>> = {},
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
    ...(opts.remindAt && { remindAt: opts.remindAt }),
    ...(opts.detail && { detail: opts.detail }),
    ...(opts.link && { link: opts.link }),
  };
}

/** "6E7415 to Pantnagar from T1". */
export function connectionDetail(c: Connection): string {
  const to = c.destination ? (AIRPORTS[c.destination]?.city ?? c.destination) : undefined;
  return [c.flightNumber, to && `to ${to}`, c.terminal && `from ${c.terminal}`].filter(Boolean).join(' ');
}

function connectionSteps(f: FlightLeg): TimelineStep[] {
  return (f.connections ?? []).map((c) => {
    const at = zonedToInstant(c.departure, c.timeZone);
    return step('connection', 'Next flight departs', at, c.timeZone, {
      estimate: false,
      notify: true,
      remindAt: addMinutes(at, -CONNECTION_REMIND_MINUTES),
      detail: connectionDetail(c) || undefined,
    });
  });
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
    step('takeoff', 'Flight departs', takeoff, tz, { estimate: false, detail: f.flightNumber && [f.flightNumber, f.terminal && `from ${f.terminal}`].filter(Boolean).join(' ') }),
    ...connectionSteps(f),
    ...checkInSteps(f),
    step('bookRide', 'Book a ride to the airport', pack, tz, { detail: `Leave at ${timeLabel(leave, tz)}` }),
    ...landingSteps(f, 'the hotel'),
  ];
}

/** "Web check-in opens", one per airline on the journey. */
function checkInSteps(f: FlightLeg): TimelineStep[] {
  return journeyCheckIns(f).map((c) =>
    step('checkin', 'Web check-in opens', c.at, f.timeZone, { estimate: false, detail: `${c.flightNumbers.join(' and ')} · ${c.airline}`, link: c.url }),
  );
}

/** Landing, then the ride on: "Land in Pantnagar", "At the hotel". */
function landingSteps(f: FlightLeg, place: string): TimelineStep[] {
  if (!f.lands) return [];
  const tz = (f.destination && AIRPORTS[f.destination]?.timeZone) || f.timeZone;
  const lands = zonedToInstant(f.lands, tz);
  const onward = f.onwardMinutes ?? DEFAULTS.travelMinutes;
  const city = f.destination ? (AIRPORTS[f.destination]?.city ?? f.destination) : undefined;
  return [
    step('land', city ? `Land in ${city}` : 'Land', lands, tz, { estimate: false, detail: `Ride to ${place}: about ${duration(onward)}` }),
    // Half an hour to leave the plane and collect bags.
    step('arrive', place === 'home' ? 'Home' : 'At the hotel', addMinutes(lands, EXIT_MINUTES + onward), tz),
  ];
}

/** Time from landing to sitting in a car: off the plane, bags. */
export const EXIT_MINUTES = 30;

const duration = (m: number) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

/**
 * The flight home: the same backwards plan, but from the hotel, so the
 * reminders name the items to collect there ("checkout" items).
 */
export function returnFlightSteps(f: FlightLeg): TimelineStep[] {
  const map: Record<string, { kind: StepKind; title: string }> = {
    pack: { kind: 'returnPack', title: 'Pack to go home' },
    wake: { kind: 'returnWake', title: 'Wake up' },
    leaveCheck: { kind: 'returnLeaveCheck', title: 'Last check of the room' },
    leave: { kind: 'returnLeave', title: 'Leave for the airport' },
    airport: { kind: 'returnAirport', title: 'Arrive at the airport' },
    takeoff: { kind: 'returnTakeoff', title: 'Flight home departs' },
    connection: { kind: 'returnConnection', title: 'Next flight home departs' },
    arrive: { kind: 'arrive', title: 'Home' },
  };
  return flightSteps(f).map((s) => ({
    ...s,
    ...map[s.kind],
    ...(s.kind === 'land' && s.detail && { detail: s.detail.replace('the hotel', 'home') }),
    itemMoment: s.itemMoment ? 'checkout' : undefined,
    home: true,
  }));
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
